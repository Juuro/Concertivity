import type { Subscription as PaddleSubscription } from "@paddle/paddle-node-sdk"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getPaddleEnvConfig } from "./config"
import { getPaddleApi } from "./client"
import { paddleSubscriptionRemoteToSyncData } from "./subscription-sync"
import {
  reprocessWebhookEvent,
  syncSubscriptionFromPaddleData,
} from "./webhook-handler"

function mapRemoteStringToDb(s: string): SubscriptionStatus | null {
  switch (s) {
    case "trialing":
      return SubscriptionStatus.TRIALING
    case "active":
      return SubscriptionStatus.ACTIVE
    case "past_due":
      return SubscriptionStatus.PAST_DUE
    case "paused":
      return SubscriptionStatus.PAUSED
    case "canceled":
      return SubscriptionStatus.CANCELED
    default:
      return null
  }
}

function validDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function remoteTrialEndsAt(remote: PaddleSubscription): Date | null {
  for (const item of remote.items ?? []) {
    if (!item.recurring) continue
    const ends = validDateOrNull(item.trialDates?.endsAt)
    if (ends) return ends
  }
  return null
}

function remoteCancelScheduledFor(remote: PaddleSubscription): Date | null {
  return remote.scheduledChange?.action === "cancel"
    ? validDateOrNull(remote.scheduledChange.effectiveAt)
    : null
}

function differs(local: Date | null | undefined, remote: Date | null) {
  return (local?.getTime() ?? null) !== (remote?.getTime() ?? null)
}

export async function runPaddleReconciliation(options?: {
  maxUsers?: number
  maxDeadLetters?: number
}): Promise<{
  skipped?: boolean
  reason?: string
  usersChecked: number
  drifts: number
  deadLettersAttempted: number
}> {
  try {
    getPaddleEnvConfig()
  } catch {
    return {
      skipped: true,
      reason: "paddle_not_configured",
      usersChecked: 0,
      drifts: 0,
      deadLettersAttempted: 0,
    }
  }

  const maxUsers = options?.maxUsers ?? 25
  const maxDeadLetters = options?.maxDeadLetters ?? 10
  const paddle = getPaddleApi()

  const subs = await prisma.subscription.findMany({
    where: {
      paddleSubscriptionId: { not: null },
      NOT: { status: SubscriptionStatus.LIFETIME },
    },
    take: maxUsers,
    include: { user: { select: { id: true, paddleCustomerId: true } } },
  })

  let drifts = 0
  for (const sub of subs) {
    if (!sub.paddleSubscriptionId || !sub.user.paddleCustomerId) continue
    try {
      const remote = await paddle.subscriptions.get(sub.paddleSubscriptionId)
      const mapped = mapRemoteStringToDb(remote.status)
      const remoteTrialEnd = remoteTrialEndsAt(remote)
      const remoteCancelAt = remoteCancelScheduledFor(remote)
      const fields: string[] = []
      if (mapped && mapped !== sub.status) fields.push("status")
      if (differs(sub.trialEndsAt, remoteTrialEnd)) fields.push("trialEndsAt")
      if (differs(sub.cancelScheduledFor, remoteCancelAt))
        fields.push("cancelScheduledFor")
      if (fields.length > 0) {
        drifts += 1
        await prisma.adminActivity.create({
          data: {
            userId: sub.userId,
            action: "paddle_reconcile_drift",
            targetType: "subscription",
            targetId: sub.id,
            details: {
              dbStatus: sub.status,
              remoteStatus: remote.status,
              fields,
              dbTrialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
              remoteTrialEndsAt: remoteTrialEnd?.toISOString() ?? null,
              dbCancelScheduledFor:
                sub.cancelScheduledFor?.toISOString() ?? null,
              remoteCancelScheduledFor: remoteCancelAt?.toISOString() ?? null,
            },
          },
        })
        await syncSubscriptionFromPaddleData(
          paddleSubscriptionRemoteToSyncData(remote)
        )
      }
    } catch {
      // Per-user failure is non-fatal for the cron batch.
    }
  }

  const dead = await prisma.paddleWebhookEvent.findMany({
    where: { error: { not: null }, retryCount: { lt: 8 } },
    orderBy: { createdAt: "asc" },
    take: maxDeadLetters,
  })

  let deadLettersAttempted = 0
  for (const row of dead) {
    deadLettersAttempted += 1
    try {
      await reprocessWebhookEvent(row)
    } catch {
      await prisma.paddleWebhookEvent.update({
        where: { id: row.id },
        data: {
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      })
    }
  }

  return {
    usersChecked: subs.length,
    drifts,
    deadLettersAttempted,
  }
}
