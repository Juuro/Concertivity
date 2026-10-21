# Contract: `POST /api/paddle/webhook` event set

Signature, freshness, idempotency (`UNIQUE(eventId)`) and the 400/401/500 behaviour are unchanged.

## Accepted event types

| Event | Handler | Change |
|---|---|---|
| `subscription.created` | subscription sync | unchanged |
| `subscription.updated` | subscription sync | unchanged |
| `subscription.trialing` | subscription sync | NEW. Trial start |
| `subscription.activated` | subscription sync | NEW. Trial converted to paid |
| `subscription.canceled` | subscription sync | unchanged |
| `subscription.past_due` | subscription sync | unchanged |
| `subscription.paused` | subscription sync | unchanged |
| `transaction.completed` | lifetime handling | unchanged |
| `adjustment.created` | refund handling | unchanged |

Any other `event_type` still returns `400 invalid_envelope`.

## Operator checklist

Enable exactly the events above on the notification destination in both sandbox and production. The two new events must be enabled for trial conversion to arrive in real time; the daily reconcile repairs drift if they are missed.

## Subscription payload fields read

| Field | Used for |
|---|---|
| `status` | mapped to `SubscriptionStatus` (`trialing` → `TRIALING`) |
| `items[].recurring`, `items[].trial_dates.ends_at` | `trialEndsAt` |
| `items[].price.id` | `paddlePriceId`, `planKey` via trial or no-trial price id |
| `scheduled_change.action` = `cancel`, `scheduled_change.effective_at` | `cancelScheduledFor` (NEW); any other or missing change clears it |
| `current_billing_period`, `next_billed_at`, `canceled_at`, `custom_data.user_id`, `customer_id` | as today |

`paddleSubscriptionRemoteToSyncData` carries `scheduled_change` from API reads so webhook and reconcile paths agree.
