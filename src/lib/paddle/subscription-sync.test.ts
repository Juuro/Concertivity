import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { buildRemoteSubscription, type PrismaMock } from "@/test-utils/paddle"
import {
  getSubscription,
  getTransaction,
  listCustomerSubscriptions,
  listCustomersByEmail,
} from "./client"
import {
  discoverAndLinkPaddleCustomer,
  ensureSubscriptionSyncedFromPaddle,
  paddleSubscriptionRemoteToSyncData,
  syncBillingForUser,
  syncSubscriptionFromCheckoutTransaction,
  trySyncSubscriptionFromPaddleApi,
} from "./subscription-sync"
import {
  handleTransactionCompleted,
  syncSubscriptionFromPaddleData,
} from "./webhook-handler"

vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})
vi.mock("./client", () => ({
  getSubscription: vi.fn(),
  getTransaction: vi.fn(),
  listCustomerSubscriptions: vi.fn(),
  listCustomersByEmail: vi.fn(),
}))
vi.mock("./webhook-handler", () => ({
  handleTransactionCompleted: vi.fn(),
  syncSubscriptionFromPaddleData: vi.fn(),
}))

const db = prisma as unknown as PrismaMock
const listSubs = vi.mocked(listCustomerSubscriptions)
const listCustomers = vi.mocked(listCustomersByEmail)
const getTx = vi.mocked(getTransaction)
const getSub = vi.mocked(getSubscription)
const syncData = vi.mocked(syncSubscriptionFromPaddleData)
const handleTx = vi.mocked(handleTransactionCompleted)

// The SDK returns rich class instances; tests only need the fields we read.
const remote = (o: Record<string, unknown> = {}) =>
  buildRemoteSubscription(o) as never

beforeEach(() => {
  vi.resetAllMocks()
})

describe("paddleSubscriptionRemoteToSyncData", () => {
  it("maps an SDK subscription to webhook-shaped data", () => {
    const out = paddleSubscriptionRemoteToSyncData(
      remote({
        items: [
          {
            recurring: true,
            price: { id: "pri_monthly" },
            trialDates: { startsAt: "a", endsAt: "b" },
          },
        ],
      })
    )
    expect(out).toEqual({
      id: "sub_1",
      status: "active",
      customer_id: "ctm_1",
      custom_data: { user_id: "user_1" },
      current_billing_period: {
        starts_at: "2026-01-01T00:00:00Z",
        ends_at: "2026-02-01T00:00:00Z",
      },
      next_billed_at: "2026-02-01T00:00:00Z",
      canceled_at: null,
      scheduled_change: null,
      items: [
        {
          recurring: true,
          price_id: "pri_monthly",
          price: { id: "pri_monthly" },
          trial_dates: { starts_at: "a", ends_at: "b" },
        },
      ],
    })
  })

  it("carries a scheduled cancellation as webhook-shaped data", () => {
    const out = paddleSubscriptionRemoteToSyncData(
      remote({
        scheduledChange: {
          action: "cancel",
          effectiveAt: "2026-01-15T00:00:00Z",
          resumeAt: null,
        },
      })
    ) as Record<string, unknown>
    expect(out.scheduled_change).toEqual({
      action: "cancel",
      effective_at: "2026-01-15T00:00:00Z",
    })
  })

  it("handles a missing billing period, price and trial", () => {
    const out = paddleSubscriptionRemoteToSyncData(
      remote({
        currentBillingPeriod: null,
        items: [{ recurring: false, price: null, trialDates: null }],
      })
    ) as Record<string, unknown>
    expect(out.current_billing_period).toBeNull()
    expect(out.items).toEqual([
      {
        recurring: false,
        price_id: undefined,
        price: null,
        trial_dates: null,
      },
    ])
  })
})

describe("discoverAndLinkPaddleCustomer", () => {
  it("is null for an unknown user", async () => {
    db.user.findUnique.mockResolvedValue(null)
    expect(await discoverAndLinkPaddleCustomer("user_1")).toBeNull()
  })

  it("returns an already linked customer without calling Paddle", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: "ctm_old",
    })
    expect(await discoverAndLinkPaddleCustomer("user_1")).toBe("ctm_old")
    expect(listCustomers).not.toHaveBeenCalled()
  })

  it("is null when Paddle has no customer for the email", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: null,
    })
    listCustomers.mockResolvedValue([])
    expect(await discoverAndLinkPaddleCustomer("user_1")).toBeNull()
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it("links the first customer that has a subscription", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: null,
    })
    listCustomers.mockResolvedValue([{ id: "ctm_a" }, { id: "ctm_b" }] as never)
    listSubs.mockImplementation(async (id) =>
      id === "ctm_b" ? [remote()] : []
    )
    expect(await discoverAndLinkPaddleCustomer("user_1")).toBe("ctm_b")
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paddleCustomerId: "ctm_b" },
    })
  })

  it("falls back to the first customer when none has a subscription", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: null,
    })
    listCustomers.mockResolvedValue([{ id: "ctm_a" }, { id: "ctm_b" }] as never)
    listSubs.mockResolvedValue([])
    expect(await discoverAndLinkPaddleCustomer("user_1")).toBe("ctm_a")
  })
})

describe("trySyncSubscriptionFromPaddleApi", () => {
  it("is false when the customer has no subscriptions", async () => {
    listSubs.mockResolvedValue([])
    expect(await trySyncSubscriptionFromPaddleApi("user_1", "ctm_1")).toBe(
      false
    )
    expect(syncData).not.toHaveBeenCalled()
  })

  it("syncs the best subscription (active before canceled/past_due)", async () => {
    listSubs.mockResolvedValue([
      remote({ id: "sub_canceled", status: "canceled" }),
      remote({ id: "sub_active", status: "active" }),
      remote({ id: "sub_past_due", status: "past_due" }),
      remote({ id: "sub_other", status: "mystery" }),
    ])
    expect(await trySyncSubscriptionFromPaddleApi("user_1", "ctm_1")).toBe(true)
    expect(syncData).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_active" }),
      { userId: "user_1" }
    )
  })

  it.each([
    [["paused", "trialing"], "trialing"],
    [["paused", "canceled"], "paused"],
    [["mystery", "canceled"], "canceled"],
  ])("ranks %j so that %s wins", async (statuses, winner) => {
    listSubs.mockResolvedValue(
      statuses.map((status) => remote({ id: `sub_${status}`, status }))
    )
    await trySyncSubscriptionFromPaddleApi("user_1", "ctm_1")
    expect(syncData).toHaveBeenCalledWith(
      expect.objectContaining({ id: `sub_${winner}` }),
      { userId: "user_1" }
    )
  })

  it("is false when the sync itself fails", async () => {
    listSubs.mockResolvedValue([remote()])
    syncData.mockRejectedValue(new Error("bad payload"))
    expect(await trySyncSubscriptionFromPaddleApi("user_1", "ctm_1")).toBe(
      false
    )
  })
})

describe("syncSubscriptionFromCheckoutTransaction", () => {
  const tx = (o: Record<string, unknown> = {}) =>
    ({
      status: "completed",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      customData: { user_id: "user_1" },
      items: [{ price: { id: "pri_lifetime" } }],
      ...o,
    }) as never

  it("refuses a transaction that belongs to another user", async () => {
    getTx.mockResolvedValue(tx({ customData: { userId: "someone_else" } }))
    await expect(
      syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
    ).rejects.toThrow("transaction_user_mismatch")
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it.each(["draft", "ready", "canceled"])(
    "does nothing for an unpaid %s transaction",
    async (status) => {
      getTx.mockResolvedValue(tx({ status }))
      expect(
        await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
      ).toBe(false)
      expect(db.user.update).not.toHaveBeenCalled()
    }
  )

  it.each(["completed", "paid", "billed"])(
    "accepts a %s transaction with a subscription",
    async (status) => {
      getTx.mockResolvedValue(tx({ status }))
      getSub.mockResolvedValue(remote())
      expect(
        await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
      ).toBe(true)
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { paddleCustomerId: "ctm_1" },
      })
      expect(getSub).toHaveBeenCalledWith("sub_1")
      expect(syncData).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sub_1" }),
        { userId: "user_1" }
      )
    }
  )

  it("syncs a zero-amount trial checkout to a trialing subscription without webhooks", async () => {
    getTx.mockResolvedValue(
      tx({ items: [{ price: { id: "pri_monthly_trial" } }] })
    )
    getSub.mockResolvedValue(
      remote({
        status: "trialing",
        items: [
          {
            recurring: true,
            price: { id: "pri_monthly_trial" },
            trialDates: {
              startsAt: "2026-01-01T00:00:00Z",
              endsAt: "2026-01-15T00:00:00Z",
            },
          },
        ],
      })
    )
    expect(
      await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
    ).toBe(true)
    expect(syncData).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "trialing",
        items: [
          expect.objectContaining({
            trial_dates: {
              starts_at: "2026-01-01T00:00:00Z",
              ends_at: "2026-01-15T00:00:00Z",
            },
          }),
        ],
      }),
      { userId: "user_1" }
    )
  })

  it("ignores custom data without a user id", async () => {
    getTx.mockResolvedValue(tx({ customData: ["x"] }))
    getSub.mockResolvedValue(remote())
    expect(
      await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
    ).toBe(true)
  })

  it("uses the customer's subscriptions when the transaction has none", async () => {
    getTx.mockResolvedValue(tx({ subscriptionId: null }))
    listSubs.mockResolvedValue([remote()])
    expect(
      await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
    ).toBe(true)
    expect(handleTx).not.toHaveBeenCalled()
  })

  it("records a one-time (lifetime) purchase via the transaction handler", async () => {
    getTx.mockResolvedValue(tx({ subscriptionId: null }))
    listSubs.mockResolvedValue([])
    db.subscription.findUnique.mockResolvedValue({ id: "row" })
    expect(
      await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
    ).toBe(true)
    expect(handleTx).toHaveBeenCalledWith({
      customer_id: "ctm_1",
      custom_data: { user_id: "user_1" },
      items: [{ price_id: "pri_lifetime", price: { id: "pri_lifetime" } }],
    })
  })

  it("injects the session user when the transaction has no custom data, and handles unpriced items", async () => {
    getTx.mockResolvedValue(
      tx({
        subscriptionId: null,
        customerId: null,
        customData: null,
        items: [{ price: null }],
      })
    )
    db.subscription.findUnique.mockResolvedValue(null)
    expect(
      await syncSubscriptionFromCheckoutTransaction("user_1", "txn_1")
    ).toBe(false)
    expect(db.user.update).not.toHaveBeenCalled()
    expect(handleTx).toHaveBeenCalledWith({
      customer_id: null,
      custom_data: { user_id: "user_1" },
      items: [{ price_id: undefined, price: null }],
    })
  })
})

describe("ensureSubscriptionSyncedFromPaddle", () => {
  function user(over: Record<string, unknown> = {}) {
    db.user.findUnique.mockResolvedValue({
      paddleCustomerId: "ctm_1",
      subscription: null,
      ...over,
    })
  }

  it("does nothing for an unknown user", async () => {
    db.user.findUnique.mockResolvedValue(null)
    await ensureSubscriptionSyncedFromPaddle("user_1")
    expect(listSubs).not.toHaveBeenCalled()
  })

  it("stops when no Paddle customer can be found", async () => {
    db.user.findUnique.mockResolvedValue({
      paddleCustomerId: null,
      email: "a@b.c",
      subscription: null,
    })
    listCustomers.mockResolvedValue([])
    await ensureSubscriptionSyncedFromPaddle("user_1")
    expect(listSubs).not.toHaveBeenCalled()
  })

  it("discovers the customer when it is not linked yet", async () => {
    db.user.findUnique.mockResolvedValue({
      paddleCustomerId: null,
      email: "a@b.c",
      subscription: null,
    })
    listCustomers.mockResolvedValue([{ id: "ctm_new" }] as never)
    listSubs.mockResolvedValue([remote()])
    await ensureSubscriptionSyncedFromPaddle("user_1")
    expect(syncData).toHaveBeenCalledTimes(1)
  })

  it("pulls the subscription when none is stored locally", async () => {
    user()
    listSubs.mockResolvedValue([remote()])
    await ensureSubscriptionSyncedFromPaddle("user_1")
    expect(syncData).toHaveBeenCalledTimes(1)
  })

  it("re-syncs a row that is missing its plan key", async () => {
    user({
      subscription: { id: "r", planKey: null, paddleSubscriptionId: "sub_1" },
    })
    listSubs.mockResolvedValue([remote()])
    await ensureSubscriptionSyncedFromPaddle("user_1")
    expect(syncData).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      "a plan key",
      { id: "r", planKey: "monthly", paddleSubscriptionId: "sub_1" },
    ],
    [
      "no Paddle subscription id",
      { id: "r", planKey: null, paddleSubscriptionId: null },
    ],
  ])("leaves a row with %s alone", async (_label, subscription) => {
    user({ subscription })
    await ensureSubscriptionSyncedFromPaddle("user_1")
    expect(listSubs).not.toHaveBeenCalled()
  })
})

describe("syncBillingForUser", () => {
  it("syncs from the transaction when one is given", async () => {
    getTx.mockResolvedValue({
      status: "completed",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      customData: null,
      items: [],
    } as never)
    getSub.mockResolvedValue(remote())
    expect(await syncBillingForUser("user_1", "txn_1")).toBe(true)
    expect(listCustomers).not.toHaveBeenCalled()
  })

  it("falls back to customer discovery when the transaction lookup fails", async () => {
    getTx.mockRejectedValue(new Error("not found"))
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: "ctm_1",
    })
    listSubs.mockResolvedValue([remote()])
    expect(await syncBillingForUser("user_1", "txn_1")).toBe(true)
  })

  it("syncs through the customer when no transaction is given", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: "ctm_1",
    })
    listSubs.mockResolvedValue([])
    expect(await syncBillingForUser("user_1")).toBe(false)
    expect(listSubs).toHaveBeenCalledWith("ctm_1")
  })

  it("is false when no customer exists anywhere", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@b.c",
      paddleCustomerId: null,
    })
    listCustomers.mockResolvedValue([])
    expect(await syncBillingForUser("user_1")).toBe(false)
  })
})
