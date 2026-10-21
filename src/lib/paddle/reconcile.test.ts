import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { stubPaddleEnv, type PrismaMock } from "@/test-utils/paddle"
import { getPaddleApi } from "./client"
import { resetPaddleConfigCacheForTests } from "./config"
import { runPaddleReconciliation } from "./reconcile"
import { paddleSubscriptionRemoteToSyncData } from "./subscription-sync"
import {
  reprocessWebhookEvent,
  syncSubscriptionFromPaddleData,
} from "./webhook-handler"

vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})
vi.mock("./client", () => ({ getPaddleApi: vi.fn() }))
vi.mock("./subscription-sync", () => ({
  paddleSubscriptionRemoteToSyncData: vi.fn(),
}))
vi.mock("./webhook-handler", () => ({
  reprocessWebhookEvent: vi.fn(),
  syncSubscriptionFromPaddleData: vi.fn(),
}))

const db = prisma as unknown as PrismaMock
const paddleGet = vi.fn()
const reprocess = vi.mocked(reprocessWebhookEvent)
const syncData = vi.mocked(syncSubscriptionFromPaddleData)
const toSyncData = vi.mocked(paddleSubscriptionRemoteToSyncData)

function localSub(over: Record<string, unknown> = {}) {
  return {
    id: "row_1",
    userId: "user_1",
    status: SubscriptionStatus.ACTIVE,
    paddleSubscriptionId: "sub_1",
    user: { id: "user_1", paddleCustomerId: "ctm_1" },
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
  vi.mocked(getPaddleApi).mockReturnValue({
    subscriptions: { get: paddleGet },
  } as never)
  db.subscription.findMany.mockResolvedValue([])
  db.paddleWebhookEvent.findMany.mockResolvedValue([])
  toSyncData.mockReturnValue({ synced: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetPaddleConfigCacheForTests()
})

describe("runPaddleReconciliation", () => {
  it("skips the run when Paddle is not configured", async () => {
    vi.stubEnv("PADDLE_API_KEY", "")
    expect(await runPaddleReconciliation()).toEqual({
      skipped: true,
      reason: "paddle_not_configured",
      usersChecked: 0,
      drifts: 0,
      deadLettersAttempted: 0,
    })
    expect(db.subscription.findMany).not.toHaveBeenCalled()
  })

  it("does nothing when there is nothing to check", async () => {
    expect(await runPaddleReconciliation()).toEqual({
      usersChecked: 0,
      drifts: 0,
      deadLettersAttempted: 0,
    })
  })

  it("queries a bounded batch that excludes lifetime users", async () => {
    await runPaddleReconciliation({ maxUsers: 7, maxDeadLetters: 3 })
    expect(db.subscription.findMany).toHaveBeenCalledWith({
      where: {
        paddleSubscriptionId: { not: null },
        NOT: { status: SubscriptionStatus.LIFETIME },
      },
      take: 7,
      include: { user: { select: { id: true, paddleCustomerId: true } } },
    })
    expect(db.paddleWebhookEvent.findMany).toHaveBeenCalledWith({
      where: { error: { not: null }, retryCount: { lt: 8 } },
      orderBy: { createdAt: "asc" },
      take: 3,
    })
  })

  it("uses default batch sizes", async () => {
    await runPaddleReconciliation()
    expect(db.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 })
    )
    expect(db.paddleWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })

  it("repairs drift, audits it and syncs the remote state", async () => {
    db.subscription.findMany.mockResolvedValue([localSub()])
    paddleGet.mockResolvedValue({ id: "sub_1", status: "canceled" })
    const result = await runPaddleReconciliation()
    expect(result).toMatchObject({ usersChecked: 1, drifts: 1 })
    expect(paddleGet).toHaveBeenCalledWith("sub_1")
    expect(db.adminActivity.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        action: "paddle_reconcile_drift",
        targetType: "subscription",
        targetId: "row_1",
        details: {
          dbStatus: SubscriptionStatus.ACTIVE,
          remoteStatus: "canceled",
          fields: ["status"],
          dbTrialEndsAt: null,
          remoteTrialEndsAt: null,
          dbCancelScheduledFor: null,
          remoteCancelScheduledFor: null,
        },
      },
    })
    expect(syncData).toHaveBeenCalledWith({ synced: true })
  })

  it.each(["trialing", "active", "past_due", "paused", "canceled"])(
    "detects drift to remote status %s",
    async (remoteStatus) => {
      db.subscription.findMany.mockResolvedValue([
        localSub({ status: SubscriptionStatus.LIFETIME }),
      ])
      paddleGet.mockResolvedValue({ status: remoteStatus })
      expect((await runPaddleReconciliation()).drifts).toBe(1)
    }
  )

  describe("trial drift", () => {
    const trialEnd = new Date("2026-01-15T00:00:00Z")
    const remoteTrial = (over: Record<string, unknown> = {}) => ({
      status: "trialing",
      items: [
        {
          recurring: true,
          trialDates: { endsAt: "2026-01-15T00:00:00Z" },
        },
      ],
      scheduledChange: null,
      ...over,
    })
    const trialingSub = (over: Record<string, unknown> = {}) =>
      localSub({
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: trialEnd,
        cancelScheduledFor: null,
        ...over,
      })

    it("finds no drift when status, trial end and cancellation match", async () => {
      db.subscription.findMany.mockResolvedValue([trialingSub()])
      paddleGet.mockResolvedValue(remoteTrial())
      expect((await runPaddleReconciliation()).drifts).toBe(0)
      expect(syncData).not.toHaveBeenCalled()
    })

    it("repairs a moved trial end even when the status matches", async () => {
      db.subscription.findMany.mockResolvedValue([
        trialingSub({ trialEndsAt: new Date("2026-01-10T00:00:00Z") }),
      ])
      paddleGet.mockResolvedValue(remoteTrial())
      expect((await runPaddleReconciliation()).drifts).toBe(1)
      expect(db.adminActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "paddle_reconcile_drift",
          details: expect.objectContaining({
            fields: ["trialEndsAt"],
            dbTrialEndsAt: "2026-01-10T00:00:00.000Z",
            remoteTrialEndsAt: "2026-01-15T00:00:00.000Z",
          }),
        }),
      })
      expect(syncData).toHaveBeenCalledTimes(1)
    })

    it("repairs a trial that the provider already ended", async () => {
      db.subscription.findMany.mockResolvedValue([trialingSub()])
      paddleGet.mockResolvedValue({ status: "active", items: [] })
      expect((await runPaddleReconciliation()).drifts).toBe(1)
      expect(db.adminActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: expect.objectContaining({
            fields: ["status", "trialEndsAt"],
          }),
        }),
      })
    })

    it("repairs a missing scheduled cancellation", async () => {
      db.subscription.findMany.mockResolvedValue([trialingSub()])
      paddleGet.mockResolvedValue(
        remoteTrial({
          scheduledChange: {
            action: "cancel",
            effectiveAt: "2026-01-15T00:00:00Z",
          },
        })
      )
      expect((await runPaddleReconciliation()).drifts).toBe(1)
      expect(db.adminActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: expect.objectContaining({
            fields: ["cancelScheduledFor"],
            remoteCancelScheduledFor: "2026-01-15T00:00:00.000Z",
          }),
        }),
      })
    })

    it("repairs a scheduled cancellation the provider removed", async () => {
      db.subscription.findMany.mockResolvedValue([
        trialingSub({ cancelScheduledFor: trialEnd }),
      ])
      paddleGet.mockResolvedValue(remoteTrial())
      expect((await runPaddleReconciliation()).drifts).toBe(1)
    })

    it("compares timestamps by value and ignores other scheduled changes", async () => {
      db.subscription.findMany.mockResolvedValue([
        trialingSub({ trialEndsAt: new Date(trialEnd.getTime()) }),
      ])
      paddleGet.mockResolvedValue(
        remoteTrial({
          scheduledChange: {
            action: "pause",
            effectiveAt: "2026-01-15T00:00:00Z",
          },
        })
      )
      expect((await runPaddleReconciliation()).drifts).toBe(0)
    })

    it("ignores unparsable and non-recurring trial dates", async () => {
      db.subscription.findMany.mockResolvedValue([
        trialingSub({ trialEndsAt: null }),
      ])
      paddleGet.mockResolvedValue({
        status: "trialing",
        items: [
          { recurring: false, trialDates: { endsAt: "2026-01-15T00:00:00Z" } },
          { recurring: true, trialDates: { endsAt: "not a date" } },
          { recurring: true, trialDates: null },
        ],
        scheduledChange: { action: "cancel", effectiveAt: "garbage" },
      })
      expect((await runPaddleReconciliation()).drifts).toBe(0)
    })
  })

  it("ignores matching state and unknown remote statuses", async () => {
    db.subscription.findMany.mockResolvedValue([
      localSub(),
      localSub({ id: "row_2", userId: "user_2" }),
    ])
    paddleGet
      .mockResolvedValueOnce({ status: "active" })
      .mockResolvedValueOnce({ status: "mystery" })
    const result = await runPaddleReconciliation()
    expect(result).toMatchObject({ usersChecked: 2, drifts: 0 })
    expect(db.adminActivity.create).not.toHaveBeenCalled()
    expect(syncData).not.toHaveBeenCalled()
  })

  it("skips rows that lack a Paddle subscription or customer", async () => {
    db.subscription.findMany.mockResolvedValue([
      localSub({ paddleSubscriptionId: null }),
      localSub({ user: { id: "user_1", paddleCustomerId: null } }),
    ])
    const result = await runPaddleReconciliation()
    expect(paddleGet).not.toHaveBeenCalled()
    expect(result).toMatchObject({ usersChecked: 2, drifts: 0 })
  })

  it("continues after a provider error for one user", async () => {
    db.subscription.findMany.mockResolvedValue([
      localSub(),
      localSub({
        id: "row_2",
        userId: "user_2",
        paddleSubscriptionId: "sub_2",
      }),
    ])
    paddleGet
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValueOnce({ status: "paused" })
    const result = await runPaddleReconciliation()
    expect(result).toMatchObject({ usersChecked: 2, drifts: 1 })
  })

  it("retries failed webhook events below the retry cap", async () => {
    const rows = [
      { id: "e1", eventId: "evt_1" },
      { id: "e2", eventId: "evt_2" },
    ]
    db.paddleWebhookEvent.findMany.mockResolvedValue(rows)
    const result = await runPaddleReconciliation()
    expect(result.deadLettersAttempted).toBe(2)
    expect(reprocess).toHaveBeenNthCalledWith(1, rows[0])
    expect(reprocess).toHaveBeenNthCalledWith(2, rows[1])
    expect(db.paddleWebhookEvent.update).not.toHaveBeenCalled()
  })

  it("counts a failed retry and keeps going", async () => {
    db.paddleWebhookEvent.findMany.mockResolvedValue([
      { id: "e1" },
      { id: "e2" },
    ])
    reprocess.mockRejectedValueOnce(new Error("still broken"))
    const result = await runPaddleReconciliation()
    expect(result.deadLettersAttempted).toBe(2)
    expect(reprocess).toHaveBeenCalledTimes(2)
    expect(db.paddleWebhookEvent.update).toHaveBeenCalledTimes(1)
    expect(db.paddleWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { retryCount: { increment: 1 }, lastRetryAt: expect.any(Date) },
    })
  })
})
