# Data Model: Resolve Dependabot Alerts

No application data model change. No Prisma schema change and no migration (spec Assumptions).

Dependency metadata entities from the spec map to repo files only:

- **Security alert** → GitHub Dependabot alert; resolved by versions in `yarn.lock`.
- **Dependabot pull request** → closed after merge.
- **Accepted risk record** → section "Open items / follow-up notes" in `research.md` (D4/D5) if any fix is not possible.
