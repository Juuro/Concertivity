# Research: 14-Day Superfan Trial

## R1 — Where the trial lives
- **Decision**: Create a second catalog price per recurring plan with `trial_period` of 14 days, `requires_payment_method: true`, and no trial `unit_price` (free trial). Keep the existing monthly and yearly prices as the no-trial prices.
- **Rationale**: Per the provider's price docs, a trial is an attribute of the price; a transaction cannot switch it off. The only way to give a trial to some users and not others is to choose between two prices at checkout. Free-trial and card-required are the defaults, which is what the clarification chose.
- **Alternatives**: (a) one trial price for everyone, rejected — cannot stop repeat trials (spec US2). (b) non-catalog custom price built per transaction, rejected — loses localized price overrides and the dashboard catalog, and prices would drift from what `/pricing` previews. (c) card-less trial, rejected by clarification.

## R2 — Env configuration and fail-safe
- **Decision**: Add optional `PADDLE_PRICE_ID_MONTHLY_TRIAL` and `PADDLE_PRICE_ID_YEARLY_TRIAL`. A plan offers a trial only if its trial price id is set. `getPlanForPriceId` maps trial ids to the same `planKey`, so existing sync, entitlement and display logic is unchanged.
- **Rationale**: Unset means today's behaviour exactly; no trial wording appears (FR-004, FR-015 and the spec's "not configured" assumption). Mapping by plan avoids a parallel plan vocabulary.
- **Risk**: if the operator sets a trial on the *existing* monthly or yearly price, every user gets a trial and the guard is bypassed. Mitigation: `.env.example` and the quickstart state it; the sandbox check in the quickstart verifies the no-trial price has `trial_period: null`.
- **Alternatives**: fetch each price at runtime and read `trialPeriod` to decide, rejected for cost and latency on every page for a one-time operator check.

## R3 — Eligibility rule
- **Decision**: Two functions in `trial.ts`.
  - `getLocalTrialEligibility(userId)`: eligible when the user has no `Subscription` row. Used for rendering. No provider call.
  - `getTrialEligibility(userId)`: used at checkout. Eligible only if there is no local row **and** the provider shows no subscription (any status) for the user's linked customer id or any customer with the user's email. Any error or timeout (3 s) returns not eligible.
- **Rationale**: Rendering must not depend on the provider (constitution V, spec edge case). Checkout is where money is at stake, so it pays for the authoritative check. Failing closed protects revenue; the user can still subscribe at full price.
- **Notes**: `Subscription.userId` is unique and the row persists after cancellation, so "any row" covers canceled and expired. Lifetime rows also count. Existing helpers `listCustomersByEmail` and `listCustomerSubscriptions` already exist.
- **Alternatives**: store a `hadTrial` boolean, rejected — derivable, and it would not cover provider history.

## R4 — Known residual abuse paths (accepted)
- A user who deletes their account and signs up again: erasure deletes the local row, nulls `paddleCustomerId`, and replaces the provider customer email with a placeholder, so no history is found. Erasure obligations take priority.
- A second account with a different email: nothing links them. The provider offers no cross-customer trial limit. Accepted for a low-priced hobby product; revisit if abuse is observed.

## R5 — Webhook events for trial lifecycle
- **Finding**: the envelope union accepts seven event types. The provider also sends `subscription.trialing` (trial start) and `subscription.activated` (trial converted to paid). The route returns `400 invalid_envelope` for any type outside the union, so a destination that includes them gets failed deliveries and retries, and conversion would rely on `subscription.updated` or the daily reconcile. The earlier planning note that `subscription.trialing` is not a real event is out of date.
- **Decision**: add both to the union and route them to the existing subscription sync. No behaviour change for existing types.
- **Alternatives**: acknowledge unknown types with 200, rejected here as a wider behaviour change; documented in the contract as the operator's event list instead.

## R6 — Cancel during trial
- **Finding**: cancelling in the portal defaults to the next billing period. During a trial the subscription stays `trialing` and carries a scheduled change (`action: cancel`, `effective_at` = trial end); `canceled_at` is null until then. Today's sync drops it, so the settings page would say "first charge on …" for a user who canceled.
- **Decision**: add nullable `Subscription.cancelScheduledFor`, filled from `scheduled_change` when its action is `cancel`, cleared otherwise. Settings shows "Canceled — access until {date}, you will not be charged". Entitlement is unchanged: `TRIALING` stays entitled until the provider sends the cancel event.
- **Also shown for paid subscriptions**: the same stored date drives a "Cancels on {date}. You keep access until then." line when a paid subscription has a pending cancellation. Kept deliberately: the row would otherwise read as renewing, and the cost is one conditional line.
- **Alternatives**: reuse `canceledAt`, rejected — it means "has been canceled", and `gdpr` export and tests already treat it that way.

## R7 — Concurrency
- **Decision**: no new locking. Two checkouts opened in parallel could both carry the trial price. The `Subscription.userId` unique constraint makes the second webhook upsert update the same row instead of creating another, and the second paid subscription is already a risk handled by the "already subscribed" check once the first completes.
- **Residual**: a user could end up with two provider subscriptions in the provider; reconcile picks the primary. Out of scope; noted for the sandbox run.

## R8 — Reconciliation
- **Finding**: reconcile compares status only. A trial whose end date moved, or a pending cancel, would not be repaired.
- **Decision**: treat a difference in status, `trialEndsAt` or `cancelScheduledFor` (compared by timestamp) as drift, and keep the audit entry shape, adding the changed fields to `details`. Batch size and ordering stay as they are.

## R9 — First charge amount
- **Decision**: show the first-charge date from `trialEndsAt` and the amount from a single price fetch for the user's plan (3 s timeout, locale-formatted). If the fetch fails, show the date without an amount.
- **Rationale**: avoids storing amounts that can change with currency and country overrides; reuses the formatter already used for `/pricing`.
- **Alternatives**: read the provider's next-transaction preview, rejected as heavier and not needed for the displayed text.

## R10 — Rate limiting and abuse protection
- **Decision**: add a per-user limiter to the checkout route using the existing `createRateLimiter` (for example 10 per minute). The route now makes up to three provider calls, and the constitution requires limits on endpoints that call paid or quota-limited third parties.
- **Alternatives**: none worth the cost; the limiter is already in the repo.

## R11 — Copy and consumer-law wording
- **Decision**: trial card text states the 14 days, that a payment method is needed now, the price charged afterwards, and that charging is automatic unless canceled before the trial ends. Replace the "no trial countdown, no credit card at signup" sentence with wording that keeps "the app is free; no card at signup". Legal review of the terms stays out of scope (spec assumption).

## R12 — CSP
- **Decision**: no change. The overlay and its origins are already allowed; no new browser-side provider calls are introduced. Verified in the sandbox run in the quickstart.
