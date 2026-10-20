# Feature Specification: Payment Provider Integration Test Coverage

**Feature Branch**: `feat/paddle-mor-superfan` (tests land on the existing PR #287 branch)

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Ok, then let's implement tests for the missing parts of the payment provider integration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Subscription state stays correct under payment events (Priority: P1)

A maintainer changes the code that turns payment-provider notifications into subscription state (activation, trial start, trial-to-paid, cancellation, pause, past-due, refund, lifetime purchase). Automated tests tell them immediately whether any rule was broken before it reaches paying customers.

**Why this priority**: Wrong subscription state means customers are charged without access, or get access without paying. This is the highest-cost failure of the integration.

**Independent Test**: Run the notification-processing, validation and access-check suites alone; they pass only if every event type produces the expected subscription state and access decision.

**Acceptance Scenarios**:

1. **Given** a valid, previously unseen notification for each supported event type, **When** it is processed, **Then** the subscription reaches the expected state and an audit entry is recorded.
2. **Given** a notification already processed, **When** it is delivered again, **Then** no duplicate state change or audit entry occurs.
3. **Given** a subscription in trial, **When** the first payment completes, **Then** it becomes active.
4. **Given** a lifetime purchase, **When** a full refund arrives, **Then** access is revoked; **When** a partial refund arrives, **Then** access is kept.
5. **Given** a lifetime purchase after the offer deadline or seat cap, **When** it is processed, **Then** it is rejected and recorded as failed.
6. **Given** malformed or unknown-event payloads, **When** validated, **Then** they are rejected without changing any state.
7. **Given** users with active, trialing, past-due, canceled and lifetime subscriptions, **When** access is checked, **Then** only the entitled states grant access.

---

### User Story 2 - Checkout and webhook endpoints enforce security rules (Priority: P1)

A maintainer changes the checkout, subscription-status, sync, webhook or scheduled-reconcile endpoints. Tests confirm that unauthenticated, forged, duplicate or disabled-feature requests are always refused.

**Why this priority**: These endpoints handle money and personal data; the project's non-negotiable security rules apply.

**Independent Test**: Run the endpoint suites alone with the provider mocked.

**Acceptance Scenarios**:

1. **Given** no session, **When** checkout, status or sync is requested, **Then** access is refused.
2. **Given** the paywall feature flag is off, **When** checkout or sync is requested, **Then** the request is refused.
3. **Given** a user who already has access, **When** they start checkout, **Then** they are told they are already subscribed and nothing is created.
4. **Given** an expired lifetime offer, **When** a lifetime checkout is requested, **Then** it is refused.
5. **Given** a webhook with an invalid, stale or missing signature, **When** received, **Then** it is rejected and nothing is stored.
6. **Given** a scheduled reconcile request with a wrong or missing secret, **When** received, **Then** it is rejected; with the correct secret it runs.
7. **Given** a request body that fails validation, **When** received, **Then** it is rejected with a safe error that leaks no internal data.

---

### User Story 3 - Drift repair and privacy duties work (Priority: P2)

Tests cover the daily reconciliation against the provider (drift fixes, retry of failed notifications, lifetime users skipped) and the privacy paths (data export includes subscription data with sensitive payload parts redacted; account deletion cancels the subscription and anonymises the provider customer before deleting local data).

**Why this priority**: These protect billing correctness over time and satisfy export/erasure obligations, but fail less often than the live paths.

**Independent Test**: Run the reconcile and privacy suites alone.

**Acceptance Scenarios**:

1. **Given** local state differing from the provider, **When** reconcile runs, **Then** local state is corrected and the drift is audited.
2. **Given** previously failed notifications, **When** reconcile runs, **Then** they are retried, and those exceeding the retry limit are left flagged.
3. **Given** a user with a subscription, **When** they export their data, **Then** subscription details and redacted recent events are included and no secrets or raw provider payloads are.
4. **Given** a user deleting their account, **When** deletion runs, **Then** the subscription is canceled with retries, the provider customer is anonymised, an erasure audit is written, and a provider failure is surfaced rather than silently ignored.

---

### User Story 4 - Pricing and billing screens behave correctly (Priority: P3)

Tests cover the pricing card, checkout button and subscription section: correct plan, price and VAT note per language; sign-in redirect for visitors; "already subscribed" message; billing-portal fallback when the provider is slow; trial end date shown.

**Why this priority**: Visible but low-risk; failures are cosmetic or recoverable.

**Independent Test**: Render each component with mocked data and assert text, links and disabled states.

**Acceptance Scenarios**:

1. **Given** English or German locale, **When** a pricing card renders, **Then** it shows the matching VAT-exclusive wording.
2. **Given** an unauthenticated visitor, **When** they press subscribe, **Then** they go to sign-in and return to pricing.
3. **Given** a slow billing-portal response, **When** the subscription section loads, **Then** the manage button is disabled with an explanation and the rest still shows.
4. **Given** a trialing subscription, **When** the section renders, **Then** the trial end date is visible.

### Edge Cases

- Events arriving out of order (e.g. cancellation before activation).
- Webhook timestamp exactly at the freshness boundary.
- Provider timeout or error during checkout, sync, reconcile and erasure.
- User with both a lifetime purchase and a recurring subscription.
- Subscription with no local user match.
- Empty or whitespace secrets in configuration; missing price configuration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The suite MUST cover every supported webhook event type, including duplicate delivery, retry of failed events, trial-to-active, and lifetime refund revocation.
- **FR-002**: The suite MUST cover payload validation for accepted and rejected shapes of every event type.
- **FR-003**: The suite MUST cover access decisions for every subscription state, including lifetime.
- **FR-004**: The suite MUST cover authentication, feature-flag, ownership and input-validation refusals for every payment endpoint.
- **FR-005**: The suite MUST cover webhook rejection for invalid, stale and missing signatures.
- **FR-006**: The suite MUST cover scheduled reconcile authorization, drift correction, lifetime-user skipping and failed-event retry limits.
- **FR-007**: The suite MUST cover subscription data export (with redaction) and account-deletion cancel-then-anonymise ordering, retries and failure handling.
- **FR-008**: The suite MUST cover the pricing card, checkout button and subscription section behaviours listed in User Story 4.
- **FR-009**: Tests MUST run without network access, real provider credentials or a real database, using mocks of the provider and data layer.
- **FR-010**: Each touched payment source file MUST reach at least the project's enforced coverage threshold (80% lines).
- **FR-011**: Tests MUST NOT change production behaviour; any defect they reveal MUST be reported and fixed in a separate, clearly labelled change.

### Key Entities

- **Subscription**: a user's plan, state, trial end, period dates; lifetime is a special state.
- **Webhook event record**: a received provider notification with processing status, retry count and redacted payload.
- **Audit entry**: admin-visible record of state changes, drift repairs and erasures.
- **Provider customer**: the external billing identity linked to a user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every file in the payment integration meets or exceeds the 80% line-coverage gate, and the pull request's coverage check passes.
- **SC-002**: 100% of supported event types and subscription states are exercised by at least one passing test.
- **SC-003**: Every payment endpoint has tests for its unauthenticated, disabled-feature and invalid-input refusals.
- **SC-004**: The full payment test suite finishes in under 60 seconds on a standard developer machine and is stable across 10 consecutive runs.
- **SC-005**: Deliberately breaking any one of the rules in User Stories 1–3 (e.g. skipping duplicate detection) makes at least one test fail.

## Assumptions

- Work targets the PR #287 branch, which holds the code under test; this spec adds no new product behaviour.
- Existing test tooling and mocking conventions in the repository are reused.
- The webhook signature-verification tests already exist and are out of scope.
- Real-provider end-to-end checks, the sandbox `customers.update` verification, and the trial setup (#216) are separate work.
- Legal prerequisites (provider data-processing agreement, consent review) are out of scope.
