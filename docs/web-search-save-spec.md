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
  -> if the Firebase user is registered, retrieve Memory Bank profile attributes
  -> if the Firebase user is anonymous, use no profile attributes
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
  -> user chooses a result
  -> Web asks for the target completion day
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

- Web automatically establishes a Firebase Anonymous Authentication session, so search and public-list import do not present a login gate.
- Choosing `公開`, opening an Android `run_id`, enrichment, publication and Memory Bank operations require a non-anonymous Firebase user. Web asks for Google login only at that boundary.
- Android signs in with Google. Web must use the same Google account to retrieve Android-owned completed runs.
- API calls always send a Firebase ID token as a bearer token. Anonymous tokens can search and fetch public import payloads; registered-user tokens additionally scope BigQuery provenance, Firestore runs and Memory Bank.
- Search remains a shared-corpus operation and is not filtered by owner UID.
- Anonymous searches do not retrieve or create a Memory Bank profile. Firebase automatically deletes anonymous users older than 30 days.
- Web sign-out clears the registered session and immediately returns to an anonymous search session. Android also clears Credential Manager state so a later sign-in can choose an account again.
- `x-dev-user-id` is accepted only when `CUE_ALLOW_DEV_AUTH=true`; production App Hosting sets it to `false`.

## Brand and interaction language

- The canonical mark is the blue cuckoo handing one cue card through the widget window. The former clock mark is retired.
- The full cuckoo mark appears only where brand recognition or orientation matters, such as authentication and the empty search state. Dense results, review forms, success and error states do not repeat the mascot.
- The horizontal `Cuckoo Cue` lockup is used in desktop and mobile navigation. A small amber card stamp identifies reusable search-result cards.
- Shared colors use the supplied brand assets: warm cream surfaces, mint, deep teal, cuckoo blue, amber and dark brown outlines.
- Web search results retain the Android list-row grammar for task text, relative date ranges and priority bars while presenting each reusable list as a restrained card.
- `run` remains an internal data-model term. Web labels actions by their actual operation: `検索`, `取り込む`, and `公開`.
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

The following list is the implementation backlog as of 2026-09-05. Priority is based on whether the issue blocks deployment, corrupts data semantics, or leaves a required data path disconnected.

### P0: deployment, identity, and data correctness

- [x] **WEB-001: Firebase App Hosting build.** The backend builds from `web/`; the generated `asia-east1` URL serves the current Next.js application.
- [x] **WEB-002: Canonical production domain.** `cuckoocue.hiyozoo.com` resolves to App Hosting and reports active ownership and certificate state. The application, authenticated APIs and `assetlinks.json` are served over HTTPS.
- [x] **AUTH-001: Production Web authentication.** Anonymous and Google providers are configured, Firebase client variables are present, and production rejects requests without a verified Firebase token instead of accepting the development header. Anonymous accounts older than 30 days are automatically removed.
- [x] **AUTH-002: Contextual identity contract.** Anonymous Web users can search and retrieve public import payloads without a login screen. Google identity is requested only for completed-run retrieval, enrichment, publication and Memory Bank; its verified UID scopes private data and provenance.
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
- [x] **IMPORT-004: Verified HTTPS App Link.** Android reports `cuckoocue.hiyozoo.com: verified`, and an unqualified HTTPS import intent resolves to `app.cuckoocue/.MainActivity` on the emulator using the current debug signing identity.
- [x] **IMPORT-005: Reference-only transfer.** Task data is fetched through authenticated APIs. URLs contain only run/corpus references and the target anchor date; no inline payload or arbitrary 16 KB limit remains.
- [x] **SAVE-001: Idempotent publication.** A UUID operation id is merged into BigQuery and cross-owner reuse is rejected.
- [x] **SEARCH-002: BigQuery search index.** `task_list_search_idx` exists and `SEARCH` is exercised. Because the current table is below BigQuery's 10 GB population threshold, coverage remains 0% and current representative latency reflects an unaccelerated scan.
- [x] **OPS-001: Runtime IAM and regions.** App Hosting runtime can invoke BigQuery and Vertex AI/Memory Bank. App Hosting remains in its closest supported region `asia-east1`; BigQuery and Vertex AI remain in Tokyo `asia-northeast1`.
- [x] **OPS-002: Canonical-domain production scenario.** A Firebase-authenticated scenario on `cuckoocue.hiyozoo.com` passes completed-run sync/fetch, Memory Bank event ingestion, LLM enrichment, BQ save/idempotency, validation/privacy failures, search/ranking, paging and import payload retrieval. Generated Auth, Firestore and BQ test data are removed afterward.
- [x] **UX-002: Production Web workspace quality.** Search keeps query and result state across reloads, collapses exact completed-list copies, presents reusable context before task detail, previews long lists progressively, and exposes an explicit retryable failure state. Import shows the target day and resulting absolute task dates. Save review uses editable absolute dates, priority labels and named groups while internal offsets remain an API detail.
- [x] **TEST-001: Browser and accessibility regression.** Playwright runs the production build at desktop and mobile widths and verifies search, import, run handoff, save review, operation-id persistence and relative-date payload conversion. Axe reports zero violations for both viewports.
- [ ] **RELEASE-001: Release App Link identity.** Add the release signing certificate SHA-256 to Firebase and `assetlinks.json` when the release key exists, then repeat App Link verification with a release-signed APK.
- [ ] **UX-001: Browser routing matrix.** Manually verify Google account selection and Android-browser behavior with the app installed and missing. API authentication and installed-app OS resolution are already covered; these remaining checks concern browser UX.
- [ ] **UX-003: Verified store install links and artwork.** After the listings exist, commit the exact App Store listing id and Google Play package `app.cuckoocue` URL as reviewed product constants and cover them with tests. Store URLs must never come from user data, BigQuery, Memory Bank, query parameters or mutable runtime configuration. Download calls to action must use current official badge artwork under each store's brand guidelines; custom, generated or approximated Apple/Google icons and badges are prohibited. Until then, the `タスクを管理` menu shows text-only platform rows as `公開準備中` without a link.
