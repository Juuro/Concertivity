# Quickstart: Validating the Paddle test suite

**Prerequisites**: on branch `feat/paddle-mor-superfan`, `yarn install` done. No `.env`, DB or network needed.

## 1. Run only the Paddle tests
```bash
yarn vitest run src/lib/paddle src/lib/validations/paddle src/lib/paddle-client src/lib/paddle-consent app/api/paddle app/api/cron/paddle-reconcile src/components/checkout src/components/subscription src/components/pricing
```
Expected: all green, total time < 60 s (SC-004).

## 2. Check the coverage gate
```bash
yarn test:coverage
```
Expected: no `ERROR: Coverage for ... does not meet global threshold (80%)` for any `paddle` file (SC-001). Review the text table for each Paddle file: lines, branches, functions, statements ≥ 80.

## 3. Stability
```bash
for i in $(seq 10); do yarn vitest run src/lib/paddle app/api/paddle || break; done
```
Expected: 10 consecutive passes (SC-004).

## 4. Mutation spot-check (SC-005)
Temporarily break one rule (e.g. remove the duplicate-event check in `processPaddleWebhookEvent`, or flip the full-refund condition), run step 1, confirm at least one test fails, then `git checkout` the file.

## 5. Full gates before merge
```bash
yarn lint && yarn test && yarn build
```
Traceability: stories/FRs in [spec.md](./spec.md); fixtures in [data-model.md](./data-model.md); decisions in [research.md](./research.md).
