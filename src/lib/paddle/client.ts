import {
  Environment,
  Paddle,
  type Customer,
  type Subscription as PaddleSubscription,
} from "@paddle/paddle-node-sdk"
import { getPaddleEnvConfig } from "./config"

type PaddleClient = InstanceType<typeof Paddle>
type CreateTxBody = Parameters<PaddleClient["transactions"]["create"]>[0]
type CancelSubBody = Parameters<PaddleClient["subscriptions"]["cancel"]>[1]
type UpdateCustomerBody = Parameters<PaddleClient["customers"]["update"]>[1]

let paddleSingleton: Paddle | null = null

/** Shared Paddle Billing API client (server-only). */
export function getPaddleApi(): Paddle {
  if (paddleSingleton) return paddleSingleton
  const cfg = getPaddleEnvConfig()
  paddleSingleton = new Paddle(cfg.paddleApiKey, {
    environment:
      cfg.paddleEnvironment === "production"
        ? Environment.production
        : Environment.sandbox,
  })
  return paddleSingleton
}

export function resetPaddleApiForTests(): void {
  paddleSingleton = null
}

export function rejectAfterMs(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Paddle SDK call exceeded ${ms}ms`))
    }, ms)
  })
}

export async function createCheckoutTransaction(body: CreateTxBody) {
  const paddle = getPaddleApi()
  return paddle.transactions.create(body)
}

export async function getCustomerPortalSessionUrl(
  customerId: string,
  subscriptionIds: string[],
  timeoutMs: number
): Promise<string> {
  const paddle = getPaddleApi()
  const session = await Promise.race([
    paddle.customerPortalSessions.create(customerId, subscriptionIds),
    rejectAfterMs(timeoutMs),
  ])
  return session.urls?.general?.overview ?? ""
}

export async function listCustomerSubscriptions(
  customerId: string
): Promise<PaddleSubscription[]> {
  const paddle = getPaddleApi()
  const collection = paddle.subscriptions.list({ customerId: [customerId] })
  const items: PaddleSubscription[] = []
  for await (const sub of collection) {
    items.push(sub)
  }
  return items
}

export async function getTransaction(transactionId: string) {
  const paddle = getPaddleApi()
  return paddle.transactions.get(transactionId)
}

export async function getSubscription(subscriptionId: string) {
  const paddle = getPaddleApi()
  return paddle.subscriptions.get(subscriptionId)
}

export async function listCustomersByEmail(email: string): Promise<Customer[]> {
  const paddle = getPaddleApi()
  const collection = paddle.customers.list({ email: [email] })
  const items: Customer[] = []
  for await (const customer of collection) {
    items.push(customer)
  }
  return items
}

export async function cancelSubscription(
  subscriptionId: string,
  body?: CancelSubBody
) {
  const paddle = getPaddleApi()
  return paddle.subscriptions.cancel(subscriptionId, body ?? {})
}

export async function anonymiseCustomer(
  customerId: string,
  placeholderEmail: string
) {
  const paddle = getPaddleApi()
  const update: UpdateCustomerBody = { email: placeholderEmail }
  return paddle.customers.update(customerId, update)
}
