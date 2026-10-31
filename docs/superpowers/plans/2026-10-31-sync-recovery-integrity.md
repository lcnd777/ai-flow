# Sync recovery integrity implementation plan

**Goal:** Preserve the existing 0.13.0 implementation while preventing stale or unreadable synchronizations from advancing Flow Recovery.
**Architecture:** Keep the serialized background writer, encrypted drafts and revision counter. Extend revision checks from confirmation to preparation and insertion; fail closed when encrypted data cannot be read.
**Tech stack:** Existing dependency-free JavaScript extension and Node test runner.
**Spec:** `docs/SMART-CONTEXT-SYNC.md`, sections 4, 6 and 7; user request to preserve Claude's work and continue on a dedicated branch.

## Constraints and decisions
- Fresh clone, dedicated `codex/sync-recovery-integrity` branch from `9caaf15`; no changes to main, release versions or native identifiers.
- No new permissions, dependencies, storage migration or automatic message sending.
- Reject preparations without the captured revision (old open extension pages must reload).
- Preserve unreadable ciphertext; recovering on the original installation or explicitly dissociating remains possible.

## Tasks
- [x] Add failing regressions in `tests/sync.test.cjs`: stale capture preparation must not cancel a newer draft; stale insertion must not touch destination; missing/corrupt draft and unreadable decisions must preserve all storage; normal retry and confirmation must still work.
- [x] Extend `safari/background.js` checks before any state mutation; pass captured `baseRev` from `safari/sync-view.js` and update the locked-data message.
- [x] Run full unit suite, build and browser integration where available; review diff; document evidence and limitations in handoff; commit, push dedicated branch and open PR.

## Review focus
Stale previews in two windows; missing revision from an old page; lost key after backup restore; corrupt draft with intact decision vault; retry after failure. Tests should assert unchanged persisted state and no destination insertion on rejection.

## Progress
Baseline: 109/109 Node tests pass. Browser baseline blocked by absent Chromium executable; attempting runtime installation. No AGENTS.md, CLAUDE.md or dedicated handoff found.

Implementation: 8 regressions reproduced before fixes; 117/117 tests pass. Independent review caught pending-insert idempotency bypass; corrected with regression. Existing same-page resume UI state issue recorded in handoff for next change. Browser tests blocked by missing Chromium and failed download. PR publication follows final checks.
