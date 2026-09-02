# Cuckoo Cue Save/Search Design Doc

This track is parallel to Android local execution.

Android owns the active run and widget behavior. Web, BigQuery, and Memory Bank
support reusable save/search/import flows. They must not dictate Phase 0 widget
or local task behavior.

## Responsibilities

Web/API:

- Search reusable task-list entries.
- Save completed Android runs as reusable entries.
- Hand selected entries off to Android through an import/app-link flow.

Android/Widget:

- Execute the active task list locally.
- Own complete, undo, task editing, focus order, widget state, and redraw.
- Export a completed run snapshot when the user chooses to save it.

## BigQuery Corpus

Store one completed task-list snapshot per row. A row is a reusable corpus entry,
not an active Android run.

```text
task_list_entries
- id STRING REQUIRED
- owner_user_id STRING REQUIRED
- title STRING REQUIRED
- tasks ARRAY<STRUCT<
    text STRING REQUIRED,
    default_priority INT64 NULLABLE,
    relative_start_day INT64 NULLABLE,
    relative_end_day INT64 NULLABLE
  >>
- domain STRING NULLABLE
- context_text STRING NULLABLE
- task_groupings ARRAY<STRUCT<
    label STRING REQUIRED,
    task_offsets ARRAY<INT64>
  >> NULLABLE
- context_embedding ARRAY<FLOAT64>
- created_at TIMESTAMP
```

`domain`, `context_text`, and `task_groupings` are search/preview aids. They are
not Android widget categories.

## Memory Bank

Memory Bank is user-side context for loose similarity sorting. BigQuery remains
the reusable task-list corpus.

Initial profile schema:

```text
cuckoo_user_profile
- locale_context
- household_context
- work_context
- device_context
- mobility_context
- scheduling_context
- channel_preferences
- planning_preferences
- task_preferences
```

Memory-derived signals are weak ranking inputs, not hard filters. Search should
still work from the user's query and BigQuery context alone.

Do not send low-context widget gestures directly to long-term memory. Widget
complete, undo, filter changes, scroll, resize, temporary undo display, theme,
and text-density changes are local execution details.

## Cross-Surface Flow

```text
1. Search
   Web user message
   + Memory Bank retrieval
   -> BigQuery task_list_entries ranking

2. Import
   task_list_entries row
   -> Android import/app-link payload

3. Materialize locally
   Android Room run/task/focus rows

4. Execute
   Android app and widget mutate only local Room state

5. Save again
   Completed Android run
   -> INSERT new task_list_entries row

6. Enrich
   LLM fills or improves search/preview fields
```

The source BigQuery row is not mutated by Android execution.

## Risks To Validate

- Users may experience an imported list and its source as "the same list" even
  though the system treats them as a reusable snapshot and a local execution
  copy.
- Repeated similar completed runs can create near-duplicate search results.
- Saving must make it clear that the task list becomes searchable.
- LLM-generated search/preview fields can be wrong or overconfident.
- Memory-derived ranking must not override clear query intent.
- Web result pages should not look editable or runnable.
