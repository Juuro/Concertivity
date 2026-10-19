# Feature Specification: Resolve Dependabot Alerts

**Feature Branch**: `001-fix-dependabot-alerts`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Fix all issues found by dependabot. Fix all vulnerability issues. It's ok to do breaking changes as long as you are able to fix what's broken."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No open security alerts (Priority: P1)

As the maintainer, I want every open security alert on the repository resolved so that the deployed application is not exposed to known vulnerabilities, including the critical and high severity ones affecting runtime code.

**Why this priority**: Known vulnerabilities in runtime dependencies (one critical, four high at time of writing) put user data and the multi-tenant service at risk. This is the core of the request.

**Independent Test**: After the change, the repository's security alert list shows zero open alerts, and an audit of the dependency tree reports no known vulnerabilities at moderate severity or above.

**Acceptance Scenarios**:

1. **Given** the open alert list at spec time (12 alerts: 1 critical, 4 high, 6 medium, 1 low), **When** the change is merged, **Then** each alert is closed or auto-dismissed because the vulnerable version is no longer present.
2. **Given** an alert whose advisory has no patched release available, **When** the change is prepared, **Then** the dependency is either replaced, upgraded past the vulnerable range by another route, or the residual risk is documented with an explicit justification and a follow-up trigger.
3. **Given** a vulnerable package that is only a transitive dependency, **When** the change is prepared, **Then** the installed version is forced to a patched release without leaving duplicate vulnerable copies in the lockfile.

---

### User Story 2 - Application keeps working after upgrades (Priority: P1)

As a user of the application, I want all existing features to behave identically after dependency upgrades so that security fixes do not cause regressions.

**Why this priority**: Breaking changes are explicitly allowed, but only if everything broken is repaired. A fix that breaks the app is not a fix.

**Independent Test**: The full existing automated checks (type check, lint, unit/integration tests, production build) pass, and key flows work in a running app: sign in, view/create/edit/delete a concert, statistics page, public profile, map page.

**Acceptance Scenarios**:

1. **Given** upgraded dependencies including any major-version bump, **When** type check, lint, tests, and production build run, **Then** all pass with no new warnings treated as errors.
2. **Given** an upgraded authentication library, **When** a user signs in, signs out, and accesses a protected route, **Then** session behavior, cookie flags, and admin/ownership checks are unchanged.
3. **Given** an upgraded web framework, **When** the app's security headers and nonce-based script policy are inspected, **Then** they are unchanged and pages render without policy violations.
4. **Given** an upgrade requiring code changes (API renames, config changes), **When** the change is complete, **Then** all call sites are updated and no deprecation notices are newly introduced.

---

### User Story 3 - Open Dependabot pull requests cleared (Priority: P2)

As the maintainer, I want the queue of open Dependabot pull requests emptied so that the repository has no stale automated PRs and routine (non-security) updates are not left behind.

**Why this priority**: The request says "all issues found by dependabot", which includes version-update PRs that are not security alerts. They are lower risk but should not pile up.

**Independent Test**: After merge, no open Dependabot pull requests remain except ones opened after the change was started; superseded PRs are closed with a note.

**Acceptance Scenarios**:

1. **Given** 11 open Dependabot PRs, **When** the change lands, **Then** each is either superseded and closed, or merged.
2. **Given** a Dependabot PR whose upgrade is not applied (e.g. proven incompatible), **When** reviewing, **Then** the reason is recorded and the PR is closed or ignored explicitly rather than left open.

---

### Edge Cases

- A patched release does not exist for an alerted package (currently the case for the HTTP cache library behind the fetch tooling): fall back to replacing the parent package, overriding with a fork-free alternative, or documenting accepted risk when the code path is not reachable from the app.
- Two alerts for the same package require different patched versions per major line (e.g. one dependency present in both a 1.x and 5.x line): both lines must be patched.
- A patched version is newer than what a parent package's declared range allows: the resolution must be forced and verified to still work.
- Development-only dependencies with alerts (e.g. CSS tooling): still resolved, but may not be exercised at runtime; build must prove they still work.
- A new alert appears while the work is in progress: it is included if a patched version exists.
- Lockfile churn from a single bump pulls in unrelated version changes: unrelated changes are reviewed and kept only if checks pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST have zero open security alerts at or above low severity after the change, except any alert with no available fix that is explicitly documented as accepted risk (see FR-006).
- **FR-002**: Every dependency named by an open alert MUST resolve to a version at or above its first patched version, in every major line present in the dependency tree.
- **FR-003**: Alerts on transitive dependencies MUST be fixed by updating the parent dependency where possible, and by a forced resolution only when the parent cannot yet adopt the patched version.
- **FR-004**: Major-version upgrades MUST be allowed; every code, configuration, or test change required to keep existing behavior MUST be included in the same change.
- **FR-005**: Existing behavior covered by project conventions MUST be preserved: session verification on mutating routes, ownership scoping, admin-only access, public-profile opt-in, nonce-based script policy and style policy, feature flags, and statistics cache revalidation.
- **FR-006**: Any alert that cannot be fixed MUST be recorded in the spec's follow-up notes with advisory ID, affected path, reachability assessment from application code, and a condition for revisiting.
- **FR-007**: All open Dependabot pull requests MUST be reviewed; ones whose upgrade is included in this change MUST be closed as superseded, and ones not applied MUST have a recorded reason.
- **FR-008**: Dependency management MUST use only the project's mandated package manager, and the lockfile MUST be committed consistent with the manifest.
- **FR-009**: The change MUST NOT introduce new vulnerabilities as measured by a dependency audit at moderate severity or above.
- **FR-010**: Framework documentation shipped with the installed framework version MUST be consulted for any framework upgrade, since this project's framework version differs from common knowledge.
- **FR-011**: If an upgrade changes the privacy or consent posture (new network calls, cookies, third-party services), this MUST be flagged; none is expected.

### Key Entities

- **Security alert**: A known-vulnerability record for a dependency, with severity, affected version range, first patched version, and whether the dependency is runtime or development.
- **Dependabot pull request**: An automated version-bump proposal; may overlap with one or more alerts.
- **Accepted risk record**: A documented exception for an alert with no fix, including reachability analysis and revisit condition.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Open security alerts drop from 12 to 0 (or to a documented, justified exception count of at most 1 for the unpatched advisory) within this change.
- **SC-002**: A dependency audit reports zero vulnerabilities at moderate severity or above for runtime and development dependencies, with any exception listed in the follow-up notes.
- **SC-003**: Open Dependabot pull requests drop from 11 to 0 after merge, each closed as merged or superseded with a reason.
- **SC-004**: 100% of existing automated checks (type check, lint, tests, production build) pass on the final change.
- **SC-005**: Manual smoke test of sign in, concert create/edit/delete, statistics, public profile, and map page shows no regressions and no security-policy violations in the browser console.
- **SC-006**: No change to user-visible behavior is reported after deployment during the first week.

## Assumptions

- The alert and PR counts reflect the repository state on 2026-10-19 and may change; the final change targets whatever is open when work completes.
- The maintainer accepts breaking dependency upgrades and expects the work to include all required code fixes.
- Existing automated checks are the primary regression safety net; no new product tests are required unless an upgrade exposes a gap.
- A single pull request is acceptable for the whole change; splitting by risk (framework, auth, tooling) is allowed if review demands it.
- Alerts for the same package across multiple major lines are all in scope.
- Runtime alerts are higher priority than development-only alerts, but both are in scope.
- The one alert with no published patched version (HTTP cache library, advisory GHSA-ch52-4w7c-c8xp, affecting versions up to 4.2.0, pulled in via fetch tooling) will be handled per the edge-case fallback order; whether it is reachable from application code is to be determined during planning.
- No database schema changes are expected, so no migration is required.
