# Data Model: 14-Day Superfan Trial

## Subscription (existing table `subscription`)

Existing fields used by this feature, unchanged: `status` (`TRIALING` | `ACTIVE` | `PAST_DUE` | `PAUSED` | `CANCELED` | `LIFETIME`), `planKey`, `paddlePriceId`, `paddleSubscriptionId`, `currentPeriodEnd`, `trialEndsAt`, `canceledAt`.

### New field

| Field | Type | Rules |
|---|---|---|
| `cancelScheduledFor` | `DateTime?` | Null by default. Set from the provider's scheduled change when its action is `cancel`; cleared when the change is removed or the subscription is re-synced without one. Never client-writable. |

Migration: `ALTER TABLE "subscription" ADD COLUMN "cancelScheduledFor" TIMESTAMP(3);` — nullable, no default, no backfill. Safe with the currently deployed code (expand step only; no contract step needed). No new index: the column is only read with the row, which is already looked up by `userId`.

### State transitions touched

```text
(no row) --subscription.created/trialing (trial price)--> TRIALING   trialEndsAt = +14d
TRIALING --subscription.activated / updated--> ACTIVE                 trialEndsAt kept as history
TRIALING --first payment fails--> PAST_DUE                            existing rules
TRIALING --cancel (scheduled)--> TRIALING + cancelScheduledFor=trialEndsAt
TRIALING + cancelScheduledFor --subscription.canceled--> CANCELED     access ends, no charge
TRIALING --account erasure--> (row deleted, subscription canceled immediately)
```

`trialEndsAt` is overwritten on every sync from the provider's trial dates. When the provider omits trial dates after conversion the value becomes null, as today.

## Trial eligibility (derived, not stored)

| Input | Source |
|---|---|
| Local row exists | `Subscription` by `userId` |
| Linked customer id | `User.paddleCustomerId` |
| Customers by email | provider customer list for `User.email` |
| Provider subscriptions | provider subscription list per customer id, any status |

Output: boolean. Local check = no row. Authoritative check = no row and no provider subscription; error or timeout = false.

## Plan

`planKey` stays `monthly` | `yearly` | `lifetime_beta`. Trial price ids resolve to `monthly` or `yearly`. Lifetime has none.

## Configuration (environment, optional)

| Variable | Meaning |
|---|---|
| `PADDLE_PRICE_ID_MONTHLY_TRIAL` | Catalog price for monthly with a 14-day card-required free trial |
| `PADDLE_PRICE_ID_YEARLY_TRIAL` | Same for yearly |

Each is trimmed; empty means unset. A plan offers a trial only when its variable is set.

## Export and erasure

- Export (`getSubscriptionExportData`) adds `cancelScheduledFor` next to `trialEndsAt`.
- Erasure is unchanged: the row is deleted after the provider subscription is canceled immediately, which also stops any trial charge.
