# CuckooCue Web Search/Save Spec

Last updated: 2026-08-30

## Product Boundary

Web is the shared reusable-corpus surface.

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
| `task_groupings` | `ARRAY<STRUCT<label STRING, task_offsets ARRAY<INT64>>>` | LLM-generated grouping over task array offsets. Used for display/import structure. |
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
  -> user taps "reuse/save"
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
  -> Android imports as a user run
  -> Android converts relative_start_day/end_day to absolute schedule
  -> Android navigates to imported run confirmation/edit screen
```

Desktop web does not need an app-link handoff. Smartphone web should deep-link into Android after import is prepared.

## Paging Contract

BigQuery result pagination should be used for search result paging.

- First search creates the query job and returns the first page.
- Cursor contains the BigQuery job id and page token.
- Later pages fetch the same query job results with the cursor.
- Page 2+ must not rerun domain mapping, Memory Bank retrieval, or embedding.
- The web API exposes this as opaque `nextCursor`.

## Implementation TODO

- UI 刷新: populated widget の Cue 面にさらに寄せる。検索結果を「検索カード」ではなく、checkbox / exposure dot / priority bars を持つ Cue row として磨き込む。
- Add Android import contract and post-import navigation.
- Add smartphone app-link handoff.
- Add search index setup for `search_text` once table churn settles.
- Add production validation for redacting clearly unsafe personal data before corpus save.
