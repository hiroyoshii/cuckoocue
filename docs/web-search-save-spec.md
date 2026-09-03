# CuckooCue Web Search/Save Spec

Last updated: 2026-09-03

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
  -> all retained tasks are completed
  -> user taps "Webで確認して残す"
  -> Android opens Web with transfer contract v1
  -> Web restores the completed title, task order, priority and relative date range
  -> Web save confirmation
  -> user reviews/edits title, tasks, relative days, priority, domain, context_text, task_groupings
  -> Web generates search_text + context_embedding from the reviewed values
  -> BigQuery insert
```

Save and publish are the same operation.

`default_priority` and task order are both observed values and recommendations because the user reviews them before saving. Deleted tasks are not saved into the corpus.

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
  -> BigQuery filters candidates with SEARCH(search_text, query tokens) OR domain match
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
  -> Web opens cuckoocue://import with transfer contract v1 on Android
  -> Android imports as a new local list
  -> Android converts relative_start_day/end_day to absolute schedule
  -> Android navigates directly to the imported list confirmation/edit screen
```

The transfer contract is versioned JSON encoded as URL-safe Base64. It contains only the user-reviewed title, tasks, priority and relative date range. Corpus embeddings, scores, owner ids, domain/context and Memory Bank profile data are not sent to Android.

Android stores both sides of the imported range:

- `available_from_at`: `target_anchor_day + relative_start_day`
- `due_at`: `target_anchor_day + relative_end_day`

Desktop web does not automatically open Android. Android web opens the custom app link after import preparation and also leaves an explicit `Androidで開く` retry action on screen.

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

## Implementation TODO

The following list is the implementation backlog as of 2026-09-03. Priority is based on whether the issue blocks deployment, corrupts data semantics, or leaves a required data path disconnected.

### P0: deployment, identity, and data correctness

- [ ] **WEB-001: Repair the Firebase App Hosting build.** Configure the backend to build the Next.js application under `web/`, produce a successful rollout, and verify that its generated App Hosting URL serves the application instead of returning 404.
- [ ] **WEB-002: Connect the canonical production domain.** Map `cuckoocue.hiyozoo.com` to the App Hosting backend, complete DNS and certificate provisioning, redirect or stop advertising obsolete Firebase Hosting URLs, and smoke-test every Web entry point on the canonical domain.
- [ ] **AUTH-001: Complete production Web authentication.** Add `cuckoocue.hiyozoo.com` to Firebase Auth authorized domains, choose and enable the production sign-in provider, provide the required `NEXT_PUBLIC_FIREBASE_*` build variables, and verify that production never falls through to `x-dev-user-id`.
- [ ] **AUTH-002: Define one user identity across Android, Web, BigQuery, and Memory Bank.** Android must obtain the same Firebase UID that the Web/API uses; `owner_user_id` and Memory Bank scope must derive from that verified UID. Document sign-in, sign-out, account switching, and token handoff behavior.
- [ ] **MODEL-001: Unify task priority semantics.** Replace the incompatible Web `1..3` and Android `0..2` meanings with one canonical contract, preferably a named enum such as `strong | medium | quiet`. Validate the value at the API and Android import boundaries and migrate or reset existing test rows.
- [ ] **MODEL-002: Anchor relative task dates to run completion.** Persist or deterministically derive a stable completion anchor in Android when a list becomes complete. Build `relative_start_day` and `relative_end_day` from that anchor rather than the day the user later opens Web. BQ does not gain a `completed_at` column.
- [ ] **SEARCH-001: Restore the agreed Query First ranking contract.** Use BigQuery `SEARCH` and the coarse mapped domain to form candidates, then rank those candidates by similarity between query plus weak profile attributes and corpus context. A domain match must not unconditionally outrank a direct query match. Return truthful `text_matched` diagnostics and rename or remove misleading `matched_text` output.

### P1: required end-to-end data paths

- [ ] **MEMORY-001: Connect non-widget Android operations to Memory Bank ingestion.** Send the agreed raw operation events through the authenticated API asynchronously. Exclude widget operations, search queries, and `android_completed_run_saved`. Verify profile updates against the fixed attribute-list schema.
- [ ] **ANDROID-001: Make imported date ranges fully reviewable.** Show and edit both `available_from_at` and `due_at` on the Android confirmation/edit screen, persist both values through the repository/DAO, and test open-ended and same-day ranges.
- [ ] **MODEL-003: Add cross-field corpus validation.** Require `relative_start_day <= relative_end_day` when both exist; validate priority, task count/text, grouping offsets, duplicate offsets, and references against the reviewed task array. Apply the same contract to LLM output and user-edited enrichment.
- [ ] **PRIVACY-001: Enforce the public-corpus safety boundary.** Before save/publish, detect and block clearly unsafe personal data such as precise addresses, personal contact details, and account identifiers in titles, task text, context, and grouping labels. Keep an explicit final user confirmation because save and publish are the same operation.
- [ ] **IMPORT-001: Decide and implement import provenance.** Decide whether an Android list needs `source_corpus_entry_id`. If retained, use it for duplicate warnings, reuse attribution, and re-import behavior; if omitted, explicitly accept duplicate imports and document that imported lists are independent copies.
- [ ] **IMPORT-002: Keep BQ-only grouping behavior consistent.** `task_groupings` currently remain in the Web/BQ corpus and are not transferred to Android. Remove claims that Android consumes them, and add contract tests proving the import payload intentionally excludes grouping, domain, context, embeddings, scores, and owner data.

### P2: transport, reliability, and operations

- [ ] **IMPORT-003: Harden the Android transfer contract.** Validate every decoded task and reject unsupported versions, malformed dates, invalid priority values, excessive task counts, and oversized payloads. Show a confirmation before inserting untrusted incoming data.
- [ ] **IMPORT-004: Replace the custom scheme with a verified HTTPS App Link.** Associate `https://cuckoocue.hiyozoo.com` with the Android application and retain an explicit retry/open action. Verify installed-app, missing-app, mobile-browser, and desktop behavior.
- [ ] **IMPORT-005: Bound transfer payload size.** Establish a tested maximum for inline app-link payloads. Use a short-lived authenticated transfer ID when a reviewed list exceeds it.
- [ ] **SAVE-001: Make corpus publication idempotent.** Add a client operation ID or equivalent API contract so retries and repeated submissions cannot accidentally create duplicate rows. This need not become user-visible corpus semantics.
- [ ] **SEARCH-002: Add and verify the BigQuery search index.** Create the `search_text` search index after the table contract stabilizes, verify that `SEARCH` uses it, and record representative latency and query cost.
- [ ] **OPS-001: Verify runtime IAM and regional dependencies.** Confirm the App Hosting service account can run BigQuery jobs, read/write the corpus, call Vertex AI models, and access Memory Bank. Record the accepted latency impact of App Hosting in `asia-east1` with data/AI services in `asia-northeast1`, or align regions where supported.
- [ ] **OPS-002: Add production scenario coverage.** Exercise authenticated save, public search, paging, profile-assisted ranking, import, Android execution, completion-anchor export, re-save, retry, invalid payload, unsafe-data rejection, and cross-user isolation on the canonical domain. Preserve raw inputs, BQ rows, Memory Bank results, API outputs, and ranking diagnostics as evaluation artifacts.
