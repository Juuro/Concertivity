# Contract: `POST /api/paddle/checkout`

Only the additions are new; everything else is as today.

## Request

```json
{ "planKey": "monthly" | "yearly" | "lifetime_beta" }
```

Unchanged. There is deliberately no trial field: eligibility is decided on the server (FR-016). Unknown keys are ignored by the schema.

## Responses

| Status | Body | When |
|---|---|---|
| 200 | `{ "transactionId": string, "trial": boolean }` | Transaction created. `trial` is true only if the transaction uses the trial price. Always false for `lifetime_beta`. |
| 400 | `{ "error": "invalid_json" \| "invalid_body" \| "lifetime_offer_closed" \| "lifetime_sold_out" }` | Unchanged |
| 401 | `{ "error": "Unauthorized" }` | No session |
| 404 | `{ "error": "paywall_disabled" }` | `ENABLE_PAYWALL` off |
| 409 | `{ "error": "already_subscribed" }` | User already has access, trial included |
| 429 | `{ "error": "rate_limited" }` | NEW. Per-user limiter exceeded |
| 502 | `{ "error": "checkout_failed" }` | Provider failure creating the transaction |
| 503 | `{ "error": "paddle_not_configured" }` | Unchanged |

`200` is also returned when the eligibility lookup fails; the user then gets the no-trial price and `trial: false`.

## Server behaviour

1. Feature flag, session, config, body validation, already-subscribed and lifetime checks run in the existing order.
2. For `monthly` and `yearly`: if the plan's trial price is configured, run `getTrialEligibility(userId)`; eligible → trial price, otherwise the no-trial price.
3. Transaction custom data stays `{ user_id }`. No new data is sent to the provider.
4. Rate limit key is the user id; it is checked after the session so anonymous traffic never consumes it.

## Client behaviour

`PaddleCheckoutButton` reads `trial`. If the card promised a trial and `trial` is false, it shows a `role="status"` note (both locales) that no trial applies to this account, then opens the overlay, which displays the real price.
