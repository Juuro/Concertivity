# Feature Specification: 14-Day Superfan Trial

**Feature Branch**: `feat/paddle-mor-superfan` (lands on the existing PR #287 branch)

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "wire up the 14-day trial next"

## Clarifications

### Session 2026-10-21

- Q: Should users have to enter a payment method to start the 14-day trial, or should the trial start without a card? → A: Card required at checkout; the trial converts to paid automatically after 14 days unless canceled.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor starts a 14-day trial on a recurring plan (Priority: P1)

A signed-in user who has never held a Superfan subscription picks the monthly or yearly plan. The pricing page and checkout tell them they get 14 days of Superfan access first, what they will be charged afterwards, and on which date. After completing checkout they have Superfan access immediately and are not charged until the trial ends.

**Why this priority**: This is the feature. Without it, the trial states already modelled in the product are unreachable and users must pay up-front to try Superfan.

**Independent Test**: With a fresh user, start checkout for the monthly plan, complete it in the payment sandbox, and confirm the account shows a trial with an end date 14 days out and full Superfan access, with no charge yet.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no prior subscription, **When** they view the monthly or yearly plan, **Then** the plan states "14-day free trial", the price charged after the trial, and that billing starts when the trial ends.
2. **Given** that user, **When** they complete checkout for a recurring plan, **Then** their subscription is in trial, Superfan access is granted at once, and the trial end date is 14 days after start.
3. **Given** a user in trial, **When** they open their subscription settings, **Then** they see the trial status, the trial end date, the plan, and the date and amount of the first charge.
4. **Given** a user in trial, **When** the trial ends and the first payment succeeds, **Then** the subscription becomes active with no interruption of access.
5. **Given** a user in trial, **When** they cancel before the trial ends, **Then** they keep access until the trial end date, are never charged, and access then ends.
6. **Given** a user in trial, **When** the first payment fails at trial end, **Then** the subscription follows the existing past-due rules and the user is shown how to fix their payment method.

---

### User Story 2 - A trial is offered only once per person (Priority: P1)

A user who has already had a trial or any paid Superfan subscription (including one that was canceled or expired) is not offered a second trial. Their pricing page and checkout show the plain price, and checkout starts billing immediately.

**Why this priority**: Without this, anyone can obtain unlimited free Superfan access by cancelling and re-subscribing. It directly affects revenue.

**Independent Test**: With a user whose previous subscription is canceled, open pricing and start checkout; confirm no trial wording appears and the checkout carries no trial.

**Acceptance Scenarios**:

1. **Given** a user whose past subscription was canceled or expired, **When** they view plans, **Then** no trial wording is shown and the price is stated as charged today.
2. **Given** that user, **When** they start checkout, **Then** the purchase does not include a trial.
3. **Given** a user who started a trial and cancelled it, **When** they subscribe again, **Then** they are not given a second trial.
4. **Given** two accounts using the same payment-provider customer record, **When** the second one starts checkout, **Then** it is not given a trial.
5. **Given** a user whose subscription is lifetime, **When** they view plans, **Then** no trial is offered (they already have access).

---

### User Story 3 - Trial wording is honest and consistent everywhere (Priority: P2)

All public and in-app wording matches the new reality. Statements that say "no trial" are replaced; the landing page, pricing page, checkout and settings all describe the same terms. Lifetime plan wording is unchanged because it has no trial.

**Why this priority**: Contradictory or unclear terms about automatic charging create consumer-protection and refund-dispute risk, but this story is only useful after the trial exists.

**Independent Test**: Read every page that mentions pricing, as a new user and as a returning user, and confirm no page contradicts another about the trial.

**Acceptance Scenarios**:

1. **Given** a visitor on the landing or pricing page, **When** they read the intro text, **Then** it no longer says there is no trial, and still states that the app itself is free and needs no card at signup.
2. **Given** a recurring plan with a trial, **When** a user reads its card, **Then** it states that a payment method is collected now and that they are charged automatically after 14 days unless they cancel.
3. **Given** a signed-out visitor, **When** they view plans, **Then** trial wording is shown (they have no subscription history visible to the page) and they are asked to sign in before checkout.
4. **Given** the German and English interfaces, **When** trial wording is shown, **Then** it is present and equivalent in both.
5. **Given** the lifetime plan, **When** its card is shown, **Then** it never mentions a trial.

---

### User Story 4 - Trial state stays correct and observable (Priority: P3)

Maintainers can trust that trial status, end date and conversion survive provider notifications arriving late, twice or out of order, and that the daily reconciliation repairs any trial that drifted from the provider. Tests cover the new paths.

**Why this priority**: The state machine already exists; this protects it once users can actually reach it.

**Independent Test**: Run the trial-related suites with the provider mocked and confirm every scenario in this story passes.

**Acceptance Scenarios**:

1. **Given** a trial-start notification, **When** it is processed twice, **Then** exactly one trial results.
2. **Given** a trial-end notification arriving before the trial-start one, **When** both are processed, **Then** no second subscription or trial is created, and the daily reconciliation restores the provider's state if the stored status briefly differs.
3. **Given** local state shows a trial the provider has already ended, **When** reconciliation runs, **Then** local state is corrected and the drift is audited.
4. **Given** a user deletes their account during a trial, **When** deletion runs, **Then** the trial subscription is canceled so no charge occurs.

---

### Edge Cases

- User is in trial and starts checkout again for another plan: refused as already subscribed, as today.
- User switches from monthly to yearly during the trial: the original trial end date is kept; no new trial starts.
- Trial-eligibility check fails (database or provider unavailable): checkout falls back to no trial rather than granting one, and the user sees the plain price.
- Trial ends exactly at the moment of a pricing-page render: the page reflects the user's current state on next load.
- Payment provider is slow or down when the trial eligibility copy is rendered: the page still renders using local data only.
- Time zones: the trial end date shown to the user is the provider's date, displayed in the user's locale, and never earlier than the actual end.
- Refund requested during trial: no charge exists, so nothing to refund; access follows cancellation rules.
- Paywall feature flag is off: no trial wording or checkout appears anywhere, as for all paid plans today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The monthly and yearly Superfan plans MUST offer a 14-day trial to eligible users; the lifetime plan MUST NOT.
- **FR-002**: A user is eligible only if they have never had a trial or any paid recurring Superfan subscription, including canceled or expired ones, and their payment-provider customer record has none either.
- **FR-003**: When eligible, checkout MUST start the trial and require a payment method up front; no charge is made until the trial ends, after which the subscription converts to paid automatically unless canceled. A trial without a payment method is not offered.
- **FR-004**: When not eligible, or when eligibility cannot be determined, checkout MUST proceed without a trial and show the price as charged immediately.
- **FR-005**: A user in trial MUST have the same Superfan access as a paying subscriber for the whole trial.
- **FR-006**: The trial end date MUST be stored and shown to the user, along with the date of the first charge, and its amount whenever the amount can be retrieved, in their subscription settings.
- **FR-007**: When the first payment succeeds at trial end, the subscription MUST become active without access interruption; when it fails, existing past-due behaviour MUST apply.
- **FR-008**: Cancelling during the trial MUST keep access until the trial end date, MUST never result in a charge, and MUST then end access.
- **FR-009**: The pricing page, landing page, plan cards and checkout button MUST show trial wording only to users who are eligible or signed out, and MUST state clearly that the user is charged automatically after 14 days unless they cancel.
- **FR-010**: Existing wording that states there is no trial MUST be replaced, while keeping the statement that the app is free and requires no card at signup.
- **FR-011**: All trial wording MUST exist in both supported languages.
- **FR-012**: Processing a duplicate or out-of-order provider notification MUST NOT create a second trial or change eligibility.
- **FR-013**: Daily reconciliation MUST correct any trial whose status or end date differs from the provider and record the drift in the audit log.
- **FR-014**: Deleting an account during a trial MUST cancel the trial subscription before local data is removed, as for paid subscriptions.
- **FR-015**: The trial MUST be hidden entirely when the paywall feature flag is off.
- **FR-016**: Trial eligibility MUST be decided on the server; a client-supplied claim of eligibility MUST be ignored.
- **FR-017**: Each new or changed user-facing page and control MUST meet the project's accessibility rules (semantic markup, visible focus, accessible names).
- **FR-018**: New and changed behaviour MUST be covered by automated tests that keep the existing per-file coverage gate green.

### Key Entities

- **Subscription**: The user's single subscription record. Uses the existing trial state, trial end date, plan and billing-period end, and gains one field: the date a scheduled cancellation takes effect, so a cancel during the trial can be shown without implying a charge.
- **Trial eligibility**: A yes/no decision per user, derived from subscription history and the provider customer record. It is never stored as a client-editable flag.
- **Plan**: Monthly, yearly (trial-eligible) and lifetime (not trial-eligible).
- **Provider customer record**: The payment provider's identity for a user, used to detect prior trials across accounts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An eligible user can go from the pricing page to an active trial in under 3 minutes.
- **SC-002**: 100% of users who cancel during their trial are charged nothing.
- **SC-003**: 0 users receive a second trial after any prior subscription, verified by tests covering canceled, expired and trialed-and-canceled histories.
- **SC-004**: 100% of trial-start, trial-end, cancel and failed-first-payment paths are covered by automated tests and pass in 10 consecutive runs.
- **SC-005**: No page in either language contradicts another about trial availability or automatic charging.
- **SC-006**: After the daily reconciliation, no trial among the rows it checked differs from the provider; the real-time notifications keep the rest correct between runs.

## Assumptions

- Trials run on the payment provider's own trial mechanism, matching the original integration plan. Card-required was confirmed in clarification; card-less trials are out of scope.
- The trial applies to the monthly and yearly plans only; the trial length is fixed at 14 days and not configurable per user.
- Trial status, end date and entitlement rules already exist in the product; this feature adds the way to reach them, eligibility rules, wording and tests.
- Reminder emails before the first charge are out of scope; the provider's own billing notifications and the settings page cover notice for now.
- The landing intro and the subscription text in settings are English-only, like the surrounding pages; the pricing page and plan cards follow the visitor's language.
- Premium feature gates do not exist yet; during the trial "Superfan access" means the Superfan status only.
- The payment provider's catalog for the sandbox and production environments is configured by the operator, outside the codebase; the code must fail safe (no trial) if it is not configured for a trial.
- The existing legal prerequisites (provider terms, consent, privacy text) are handled separately; this feature adds trial terms wording but not legal review.
