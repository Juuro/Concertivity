# 0002. Per-user trial eligibility via paired catalog prices

Status: Proposed
Date: 2026-10-21

## Context

Superfan subscriptions are sold through the payment provider (merchant of record). In the provider's model a free trial is an attribute of a price, not of a transaction. The product wants a 14-day, card-required trial for first-time subscribers only. Repeat trials by cancelling and re-subscribing would let users keep access for free.

## Decision

Each recurring plan (monthly, yearly) has two catalog prices: the existing price without a trial and a second price with a 14-day card-required free trial. The server chooses between them at checkout using its own eligibility check (no local subscription row and no provider subscription history for the user's customer records; any failure means not eligible). The trial price ids are optional environment variables; a plan offers a trial only when its variable is set. Both price ids resolve to the same plan key. The client never sends or influences eligibility.

## Consequences

- Easier: eligibility logic lives in one server module, the provider stays the source of truth for trial dates, and deployments without the trial prices behave exactly as before.
- Harder: operators must keep two prices per plan in sync (amount, currency overrides, tax settings) and must never put a trial on the no-trial price. The quickstart includes a check for that.
- Accepted gaps: a deleted-and-recreated account, or a second account with a different email, can obtain another trial. The provider offers no cross-customer limit, and erasure obligations take priority.
- Alternatives rejected: one trial price for everyone (no repeat-trial protection), per-transaction custom prices (loses catalog overrides and price previews), card-less trials (not chosen; separate conversion flow required).
