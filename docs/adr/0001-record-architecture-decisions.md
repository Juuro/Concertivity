# 0001. Record architecture decisions

Status: Accepted
Date: 2026-09-23

## Context

Concertivity has accumulated non-obvious decisions (legacy `Concert.userId`/`Concert.cost` fields, shared-headliner/per-user-support-act band split, feature-flag gating, CSP nonce strategy) that live only in code comments, `CLAUDE.md`, or memory. New contributors (human or agent) have no single place to see *why* these choices were made, only *what* they are.

Concurrently, adopting [spec-kit](https://github.com/github/spec-kit) for feature work (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`) means specs will document *what* to build for a given feature. ADRs cover the complementary, longer-lived layer: durable architectural decisions that outlive any single spec.

## Decision

We will record architecturally significant decisions as ADRs in `docs/adr/`, one file per decision, numbered sequentially (`NNNN-title.md`), using `docs/adr/template.md`. An ADR is written when a spec-kit plan (`/speckit-plan`) surfaces a decision with consequences beyond the feature at hand (schema/data-model shape, auth/session model, third-party integration boundary, cross-cutting conventions) — not for every feature, and not as a substitute for the spec itself.

Existing undocumented decisions get backfilled opportunistically when touched, not all at once.

## Consequences

Easier: onboarding (human or agent) to *why* a constraint exists; avoiding relitigating settled trade-offs; spec-kit plans can reference an ADR instead of re-explaining rationale inline.

Harder: one more artifact to keep from going stale — an ADR is a record of a decision made under given constraints and can be superseded, but should not be silently edited once accepted.
