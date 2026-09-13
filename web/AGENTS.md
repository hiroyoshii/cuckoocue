<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cuckoo Cue Web acceptance

- Before changing Web behavior, read `../docs/design_v2.md` and `../docs/web-experience-spec.md`, especially decisions D1-D10, acceptance criteria 7.1, and gaps G/W/C in section 10. The current implementation and the static prototypes are not the source of product requirements.
- Keep the accepted A information architecture. Implement reusable tasks as private originals, immutable public revisions and current Runs with separate mutation targets. Do not create a domain entity or storage field to fill a UI gap without first recording and sharing the gap.
- Apply section 7.1 to each delivered user journey: readable task rows, inline editing, final-day-based dates, recovery without input loss, truthful save/device state, approved brand assets and Zen Kaku Gothic New. Do not repair unclear flows by adding explanatory copy.
- Run the relevant `tests/e2e/reuse-quality.spec.ts` checks and existing regressions, build, lint, and inspect desktop/mobile screenshots. Retain the existing gap IDs when recording the exact tested scope and evidence in the experience spec.
- UI tests with intercepted API responses are not BQ/Firestore/authentication/Android integration evidence. Keep partial delivery and unresolved data paths explicit; do not mark the corresponding whole gap resolved merely because a screenshot or UI test passes.

## Verification artifacts

- Keep screenshots, raw API responses, build/rollout exports and logs local in the ignored `docs/review-screenshots/` or `output/` directories. Do not commit or force-add them.
- Commit only a concise verification summary with test scope and outcomes. Do not include credentials, environment values, internal resource IDs or personal data. Historical artifact links in docs refer to local evidence, not repository-hosted files.
