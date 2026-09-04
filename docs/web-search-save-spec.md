# CuckooCue Web Search/Save Spec

Last updated: 2026-09-04

## Product Boundary

Web is the shared reusable-corpus surface.

- Canonical production URL: `https://cuckoocue.hiyozoo.com`.
- Primary job: search reusable completed task lists.
- Secondary job: save a reviewed completed run as a reusable task list.
- Android owns active task execution, import into a user run, completion, and post-import navigation.
- Widget operations are excluded from Memory Bank ingestion.
- Authentication/user identity is delegated to Firebase/Auth. Web corpus search is not scoped to `owner_user_id`.

## BigQuery Corpus

Table: `cuckoocue.cuckoo_cue.task_list_entries`

Each row is one user-reviewed reusable completed task list.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | `STRING` | Stable corpus entry id used for fetch/import. |
| `owner_user_id` | `STRING` | Saving user provenance. Not a search scope. |
| `title` | `STRING` | User-visible original title. |
| `tasks` | `ARRAY<STRUCT<text STRING, default_priority INT64, relative_start_day INT64, relative_end_day INT64>>` | Reusable task template. Relative days are anchored to the future target day chosen at import time. |
| `domain` | `STRING` | Coarse activity domain, e.g. `引っ越し`, `旅行準備`. |
| `context_text` | `STRING` | Reusable task-list context: locale, institutions, service categories, constraints, and other details that distinguish similar domains. |
| `task_groupings` | `ARRAY<STRUCT<label STRING, task_offsets ARRAY<INT64>>>` | LLM-generated grouping over task array offsets. Used by the Web corpus for search and display. |
| `search_text` | `STRING` | Tokenized projection used by BigQuery `SEARCH`. Generated from user-approved title/tasks/domain/context/groupings. |
| `context_embedding` | `ARRAY<FLOAT64>` | Embedding of user-approved query-relevant context for similarity sorting. Internal only. |
| `created_at` | `TIMESTAMP` | Operational metadata. Not a semantic deadline or completion anchor. |

Not included:

- `completed_at`: not needed in corpus because relative timing is anchored at import.
- absolute deadlines: Android derives them from `target_anchor_day`.
- visibility/category/source run metadata: out of MVP scope.

## Save Flow

```text
Android completed run
  -> Android syncs the owner-scoped run snapshot to Firestore through the authenticated API
  -> all retained tasks are completed
  -> user taps "Webで確認して残す"
  -> Android confirms sync and opens Web with only run_id
  -> Web authenticates the same user and fetches the completed run by owner UID + run_id
  -> Web derives relative date ranges from the completion anchor in the run's time zone
  -> Web save confirmation
  -> user reviews/edits title, tasks, relative days, priority, domain, context_text, task_groupings
  -> Web generates search_text + context_embedding from the reviewed values
  -> BigQuery insert
```

Save and publish are the same operation.

`default_priority` and task order are both observed values and recommendations because the user reviews them before saving. Deleted tasks are not saved into the corpus.

## Run Sync

Firestore stores owner-scoped operational run snapshots at
`users/{uid}/runs/{run_id}`. Each document contains the Room run fields, the
device time zone and its task array. It is not public corpus data.

- Room remains the immediate Android state used by the app and widget.
- Android queues a fresh full-run snapshot after each run/task mutation,
  including widget completion and undo.
- Signing in queues every local run again, covering edits made while signed out
  and interrupted background uploads.
- Opening the Web save review performs a synchronous upload first and opens the
  browser only after it succeeds.
- The API derives completion-relative days from absolute task timestamps using
  the synced completion anchor and device time zone.
- API access is always scoped by the verified Firebase UID; `run_id` is an
  identifier, not an authorization secret.
- Publishing creates an independent, user-reviewed BigQuery corpus snapshot.

Multi-device merge/conflict behavior and a restore UI are separate from this
cross-surface mirror. They require an explicit conflict policy before enabling
cloud-to-Room mutation.

## Memory Bank

Memory Bank stores weak user context only. It does not store task-list context.

Fixed profile schema:

- `locale_attributes`
- `household_attributes`
- `work_attributes`
- `device_attributes`
- `mobility_attributes`
- `scheduling_attributes`
- `channel_attributes`
- `planning_attributes`
- `task_style_attributes`

Each value should be a short attribute phrase, not a long explanation. Examples:

- `平日昼間は仕事`
- `土日にまとめて作業`
- `メール・Webフォーム優先`
- `京都から大阪への転居`

Memory Bank events are raw operation-like text from API operations. Search queries are not ingested as memory. `android_completed_run_saved` is not a Memory Bank event; the reviewed reusable list is persisted through the BigQuery save path.

## Search Flow

```text
User natural-language query
  -> retrieve Memory Bank profile attributes for the user
  -> fetch distinct BigQuery domains from daily cache
  -> LLM maps query to one existing coarse domain or null
  -> BigQuery admits candidates matching at least one query token with SEARCH(search_text, token), or the mapped domain
  -> BigQuery sorts filtered candidates by similarity between:
       query text + weak user profile attributes
       and corpus context_embedding
  -> Web returns paged results
```

Important intent:

- Query text is the main search intent.
- User profile is weak context for sorting, not a hard filter.
- Domain is a coarse guard to avoid obviously wrong domains.
- `context_text` carries the detailed reusable situation.
- Scores are diagnostics. Production UI does not show numeric scores.

Current API returns:

- `searchDomain`
- result `title`
- result `domain`
- result `context_text`
- result `task_groupings`
- result tasks, collapsed/expandable when long

## Import Flow

```text
Web search result
  -> user chooses target_anchor_day
  -> Web fetches import payload by corpus id
  -> Web opens https://cuckoocue.hiyozoo.com/import with entry_id and target_anchor_day only
  -> Android receives the verified HTTPS App Link
  -> Android authenticates and fetches the corpus payload from the API
  -> Android imports as a new local list
  -> Android converts relative_start_day/end_day to absolute schedule
  -> Android navigates directly to the imported list confirmation/edit screen
```

The App Link carries references, not task data. The authenticated import API returns only the user-reviewed title, tasks, priority and relative date range. Corpus embeddings, scores, owner ids, domain/context and Memory Bank profile data are not sent to Android.

Imported lists are independent local copies. Android intentionally does not retain a corpus source id, so importing the same reusable list more than once creates separate lists.

Android stores both sides of the imported range:

- `available_from_at`: `target_anchor_day + relative_start_day`
- `due_at`: `target_anchor_day + relative_end_day`

Desktop Web does not automatically open Android. Android Web opens the HTTPS App Link after import preparation and also leaves an explicit `Androidで開く` retry action on screen.

## Identity Contract

- Web and Android both sign in with Google through Firebase Authentication.
- API calls send a Firebase ID token as a bearer token. The server verifies it and uses its UID for BigQuery `owner_user_id` and Memory Bank scope.
- Search remains a shared-corpus operation and is not filtered by owner UID.
- Sign-out clears the local Firebase session. Android also clears Credential Manager state so a later sign-in can choose an account again.
- `x-dev-user-id` is accepted only when `CUE_ALLOW_DEV_AUTH=true`; production App Hosting sets it to `false`.

## Brand and interaction language

- The shared mark is a clock face with one gold cue point.
- Shared colors come from the Android app/widget: ink, off-white surface, teal, green and gold.
- Web search results use the same list-row grammar as Android: exposure dot, square completion affordance, task text, date range and priority bar.
- `run` remains an internal data-model term. User-facing labels use `リスト`, `項目`, `完了した内容`, `探す`, `残す` and `使う`.
- Search failure is explicit and retryable. It does not silently fall back to a different ranking path.

## Paging Contract

BigQuery result pagination should be used for search result paging.

- First search creates the query job and returns the first page.
- Cursor contains the BigQuery job id and page token.
- Later pages fetch the same query job results with the cursor.
- Page 2+ must not rerun domain mapping, Memory Bank retrieval, or embedding.
- The web API exposes this as opaque `nextCursor`.
- Web observes the result-tail sentinel and fetches the next page shortly before it enters the viewport. The visible button remains as a keyboard-accessible retry path.

## Implementation Status

The following list is the implementation backlog as of 2026-09-03. Priority is based on whether the issue blocks deployment, corrupts data semantics, or leaves a required data path disconnected.

### P0: deployment, identity, and data correctness

- [x] **WEB-001: Firebase App Hosting build.** The backend builds from `web/`; the generated `asia-east1` URL serves the current Next.js application.
- [ ] **WEB-002: Canonical production domain.** The App Hosting domain resource exists, but the external DNS A/TXT/ACME records and resulting certificate are still pending. This is the only Web deployment blocker outside this repository/project.
- [x] **AUTH-001: Production Web authentication.** Google sign-in and authorized domains are configured, Firebase client variables are present, and production rejects unauthenticated API requests instead of accepting the development header.
- [x] **AUTH-002: Shared identity contract.** Web and Android use Firebase Auth; verified UID scopes provenance and Memory Bank as documented above.
- [x] **MODEL-001: Priority semantics.** Web, API, BigQuery and Android use nullable integer values `0=強`, `1=中`, `2=弱`.
- [x] **MODEL-002: Completion-relative dates.** Android syncs a stable completion anchor and absolute task dates; the owner-scoped Web API derives both relative range endpoints in the run's recorded time zone. BQ has no completion timestamp.
- [x] **SEARCH-001: Query First ranking.** BigQuery uses `SEARCH`/mapped domain only to select candidates, then sorts the candidate set by query plus weak-profile context similarity. Diagnostics expose truthful `text_matched` and `context_score` values only in the API/logging layer.

### P1: required end-to-end data paths

- [x] **SYNC-001: Owner-scoped run mirror.** Android mutations and sign-in reconciliation upload complete Room run snapshots through the authenticated API to Firestore; Web save review fetches only the caller's completed run by id.
- [ ] **SYNC-002: Multi-device restore and conflicts.** Define per-run/per-task conflict semantics and restoration UX before applying cloud snapshots back into Room. This is not required for Android-to-Web completed-run publication.
- [x] **MEMORY-001: Android Memory Bank ingestion.** Authenticated non-widget app operations send raw events asynchronously. Widget actions, search queries and completed-list publication are excluded; live profile retrieval was verified against the fixed attribute-list schema.
- [x] **ANDROID-001: Reviewable date ranges.** Android edits, persists and syncs start/end dates; import converts the API-returned relative range around the selected target day.
- [x] **MODEL-003: Cross-field validation.** API, enrichment output and Android import validate ranges, priorities, text limits, grouping offsets and duplicate membership.
- [x] **PRIVACY-001: Public-corpus safety.** Save blocks obvious precise addresses, contact details and account identifiers and requires explicit publication confirmation.
- [x] **IMPORT-001: Import provenance decision.** Imported lists are independent copies and retain no corpus source id.
- [x] **IMPORT-002: BQ-only grouping.** Grouping/domain/context/internal fields stay out of the Android transfer payload; E2E checks the exact boundary.

### P2: transport, reliability, and operations

- [x] **IMPORT-003: Authenticated Android import.** The App Link validates origin/path and reference fields; Android then authenticates, fetches and validates the payload before confirmation and local insert.
- [ ] **IMPORT-004: Verified HTTPS App Link.** Manifest and `assetlinks.json` are implemented and debug-signed behavior is covered. End-to-end domain verification awaits external DNS/certificate provisioning; the release signing SHA-256 must be added when a release key exists.
- [x] **IMPORT-005: Reference-only transfer.** Task data is fetched through authenticated APIs. URLs contain only run/corpus references and the target anchor date; no inline payload or arbitrary 16 KB limit remains.
- [x] **SAVE-001: Idempotent publication.** A UUID operation id is merged into BigQuery and cross-owner reuse is rejected.
- [x] **SEARCH-002: BigQuery search index.** `task_list_search_idx` exists and `SEARCH` is exercised. Because the current table is below BigQuery's 10 GB population threshold, coverage remains 0% and current representative latency reflects an unaccelerated scan.
- [x] **OPS-001: Runtime IAM and regions.** App Hosting runtime can invoke BigQuery and Vertex AI/Memory Bank. App Hosting remains in its closest supported region `asia-east1`; BigQuery and Vertex AI remain in Tokyo `asia-northeast1`.
- [ ] **OPS-002: Canonical-domain production scenario.** The generated App Hosting production URL passes authenticated API save/search/paging/import and failure-path E2E; Android execution/export is covered by emulator instrumentation. Repeat the Web smoke test on the canonical hostname after WEB-002, including interactive Google account selection and installed/missing-app browser routing.
