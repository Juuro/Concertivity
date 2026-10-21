import { z } from "zod"

const envelopeBranch = (eventType: string) =>
  z.object({
    event_id: z.string().min(1),
    event_type: z.literal(eventType),
    data: z.unknown(),
  })

/**
 * Paddle Billing webhook envelope — discriminated on `event_type` (plan AC / DA2).
 */
export const paddleWebhookEnvelope = z.discriminatedUnion("event_type", [
  envelopeBranch("subscription.created"),
  envelopeBranch("subscription.trialing"),
  envelopeBranch("subscription.activated"),
  envelopeBranch("subscription.updated"),
  envelopeBranch("subscription.canceled"),
  envelopeBranch("subscription.past_due"),
  envelopeBranch("subscription.paused"),
  envelopeBranch("transaction.completed"),
  envelopeBranch("adjustment.created"),
])

export type PaddleWebhookEnvelope = z.infer<typeof paddleWebhookEnvelope>

export const paddleCheckoutBodySchema = z.object({
  planKey: z.enum(["monthly", "yearly", "lifetime_beta"]),
})

export type PaddleCheckoutBody = z.infer<typeof paddleCheckoutBodySchema>

export const paddleSyncBodySchema = z.object({
  transactionId: z.string().min(1).optional(),
})

export type PaddleSyncBody = z.infer<typeof paddleSyncBodySchema>
