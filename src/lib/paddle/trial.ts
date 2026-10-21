import { prisma } from "@/lib/prisma"
import {
  listCustomerSubscriptions,
  listCustomersByEmail,
  rejectAfterMs,
} from "./client"

const PROVIDER_LOOKUP_TIMEOUT_MS = 3000

/**
 * Local-only eligibility for rendering: a user who ever had a subscription row
 * (any status, including canceled and lifetime) is not offered a trial.
 * Makes no provider call, so pages never depend on the provider being up.
 */
export async function getLocalTrialEligibility(
  userId: string
): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { id: true },
  })
  return sub === null
}

async function providerShowsNoSubscriptions(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, paddleCustomerId: true },
  })
  if (!user) return false

  const customerIds = new Set<string>()
  if (user.paddleCustomerId) customerIds.add(user.paddleCustomerId)
  for (const customer of await listCustomersByEmail(user.email)) {
    customerIds.add(customer.id)
  }

  for (const customerId of customerIds) {
    const subs = await listCustomerSubscriptions(customerId)
    if (subs.length > 0) return false
  }
  return true
}

/**
 * Authoritative eligibility for checkout. Fails closed: any provider error or
 * timeout means "not eligible", so the user is charged the plain price.
 */
export async function getTrialEligibility(userId: string): Promise<boolean> {
  try {
    if (!(await getLocalTrialEligibility(userId))) return false
    return await Promise.race([
      providerShowsNoSubscriptions(userId),
      rejectAfterMs(PROVIDER_LOOKUP_TIMEOUT_MS),
    ])
  } catch {
    return false
  }
}
