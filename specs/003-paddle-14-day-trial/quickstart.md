# Quickstart: validating the 14-day trial

## Prerequisites

- `yarn install`, `yarn db:generate`, and the new migration applied locally (`yarn prisma migrate dev`).
- Provider **sandbox** with notification destination events from [contracts/webhook-events.md](./contracts/webhook-events.md).
- In the sandbox catalog, for monthly and yearly: the existing price has `trial_period: null`; a second price exists with a 14-day trial and `requires_payment_method: true`.
- Env (see `.env.example`): existing price ids, plus `PADDLE_PRICE_ID_MONTHLY_TRIAL`, `PADDLE_PRICE_ID_YEARLY_TRIAL`, `ENABLE_PAYWALL=true`, `PADDLE_ENVIRONMENT=sandbox`.
- A dev server is not already running (CLAUDE.md); screenshots via `node screenshot.mjs`.

## 1. Automated checks

```sh
yarn lint
yarn test
yarn test:coverage     # per-file 80% gate must stay green
yarn build
```

Expect all green. Run the trial suites 10 times in a row for SC-004.

## 2. Eligible user (US1)

1. Sign in as a user with no subscription. Open `/pricing`.
2. Monthly and yearly cards show "14-day free trial", the post-trial price and the auto-charge sentence; lifetime shows no trial wording.
3. Start checkout; pay with a sandbox test card. Expect no charge today.
4. Settings → Subscription shows status `TRIALING`, trial end 14 days out, first charge date and amount.
   Also run once on localhost without webhooks: after checkout the pricing page's sync call must produce `TRIALING`. Note the status Paddle reports for the zero-amount trial transaction; if it is not `completed`, `paid` or `billed`, `transactionIsPaid` needs that status.
5. Sandbox: advance the subscription to the trial end. Expect `ACTIVE` after `subscription.activated`, no gap in access.

## 3. Cancel during trial (US1.5)

1. In a trial, open the billing portal and cancel.
2. Settings shows "Canceled — access until {trial end}" and no first-charge line; access remains.
3. Advance to trial end: status becomes `CANCELED`, no transaction exists.

## 4. Repeat trial blocked (US2)

1. Use a user whose subscription is `CANCELED`. `/pricing` shows no trial wording.
2. Start checkout: response has `trial: false`; the overlay shows the full price.
3. Create a second local account with the same email as a prior sandbox customer: checkout returns `trial: false`.

## 5. Fail-safe

- Unset `PADDLE_PRICE_ID_MONTHLY_TRIAL`: no trial wording for monthly, checkout uses the existing price.
- Break the provider key temporarily: `/pricing` still renders; checkout returns the standard error and never a trial.
- Set `ENABLE_PAYWALL=false`: no trial wording anywhere.

## 6. Drift and privacy

- Change the sandbox trial end date, run `GET /api/cron/paddle-reconcile` with the cron secret: local `trialEndsAt` is corrected and an audit entry exists.
- Delete an account that is in trial: the provider subscription is canceled immediately.

## 7. Operator sanity check

Confirm in the sandbox dashboard that the no-trial prices still have no trial period; otherwise every user would get a trial.

## 8. CSP smoke test

Open the overlay with the browser console open; expect no CSP violations (no CSP change is made by this feature).
