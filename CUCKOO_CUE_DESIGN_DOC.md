# Cuckoo Cue Design Doc

## Product Shape

Cuckoo Cue is not a task-management system. It is a small surface for bringing
back a few useful cues at the moment they can be acted on.

The core loop is:

```text
create or start a small run
-> choose ordered focus tasks
-> show them on the Android widget
-> complete from the widget or app
-> redraw from the current local task state
```

The model should stay state-centered unless a feature genuinely needs operation
history. Reliability requirements should make state updates atomic; they should
not introduce a command log, CDC layer, gateway database, or drain pipeline by
default.

## Phase 0 Decisions

Phase 0 starts on Android because it is easiest to verify on the current
development machine.

Initial stack:

- Kotlin
- Jetpack Compose for the app UI
- Jetpack Glance for the home-screen widget
- Room + SQLite for one local application database

Phase 0 includes:

- Manual run creation
- A small task list
- An ordered focus list for the widget
- One resizable Android widget that can scroll through its focus cues
- Complete
- Undo complete
- Local crash/restart verification

Phase 0 defers:

- Skip
- Snooze
- Multi-device sync
- Account backup and restore
- Public source pages
- Curator workflows
- iOS widgets
- Operation history as a user-visible feature
- CDC, outbox, drain checkpoints, or a separate widget gateway database
- WorkManager for widget complete/undo

## State Model

The essential local state is task state.

Minimum tables:

- `runs`
- `run_tasks`
- `focus_assignments`

Optional table:

- `widget_snapshots`

Default to no `widget_snapshots` table in Phase 0. The widget should query Room
and render from `run_tasks` plus `focus_assignments`. The widget may show a
scrollable subset of the focus list depending on the launcher-provided size, but
the data model must not impose a three-item limit.

Add `widget_snapshots` only if measurement or Android update constraints show
that a precomputed projection is needed. If added, keep it inside the same Room
database so task updates and projection updates can share one transaction.

## Table Purposes

`runs` groups a small set of tasks.

`run_tasks` stores the task content and lifecycle:

```text
id
run_id
title
status          -- pending | completed
version         -- INTEGER NOT NULL DEFAULT 0
priority        -- small integer cue strength; lower number is stronger
category_key
category_label
category_color_key
sort_order
completed_at
created_at
updated_at
```

Use `pending | completed` for task status in implementation. Avoid `active` for
task status because run lifecycle may also use "active".

`priority` and category fields are not an operation log. They are the minimal
rendering projection the widget needs so it does not infer product meaning from
display slot. If the local database is replaced later, preserve this projection
contract for the widget:

```text
taskId
title
status
version
priority
categoryKey
categoryLabel
categoryColorKey
slot
```

`focus_assignments` stores the ordered list of tasks currently eligible for the
widget. This is separate from task content because "this task exists" and "this
task is on the home-screen surface" are different facts.

```text
id
task_id
slot            -- zero-based display order
created_at
updated_at
```

Constraints:

```text
UNIQUE(task_id)
UNIQUE(slot)
CHECK(slot >= 0)
FOREIGN KEY(task_id) REFERENCES run_tasks(id) ON DELETE CASCADE
```

For Phase 0, do not add `snoozedUntil`. Add it only when snooze exists as a real
feature.

If `widget_snapshots` is used, it stores the rendered widget projection:

```text
snapshot_key
rendered_json
updated_at
last_undo_task_id
last_undo_expires_at
```

Do not create a generic action table only for undo. With `pending` and
`completed` as the only Phase 0 task states, undo complete is just:

```text
completed -> pending
```

If a short-lived widget undo affordance needs to survive process restart, store
the last completed task id in `widget_snapshots` or a tiny preference. Do not
promote that to a domain operation model.

## Widget Commit Rule

Widget actions update the same local database that the app reads.

Complete and undo do not change `focus_assignments` in Phase 0. The widget body
shows pending tasks from the ordered focus list:

```text
pending   -> unchecked row in the body
completed -> hidden from the body
```

Do not auto-fill a completed task's slot in Phase 0. The completed task is
removed from the visible body, but its focus assignment stays in place. This
keeps undo simple, prevents another task from jumping into the just-completed
slot, and keeps the complete transaction to a single task-state update. A focus
assignment changes only when the user explicitly changes the focus list/order.

After a successful widget complete, show a temporary undo affordance at the
lower-left of the widget. This is widget UI state, not a domain action log. The
undo stores only the task id and post-complete version needed for the optimistic
undo. It does not need an exact countdown; it only needs to appear immediately
after the operation and disappear on undo, later widget interaction, app-side
task/focus mutation, or app launch.

The widget must not treat focus as exactly three slots. A small widget may only
show a few rows at a time, but additional focused tasks remain reachable through
vertical scrolling.

The app UI must follow the same rule. It may offer a simple "add to focus"
control for Phase 0, but it must not expose only hard-coded slot buttons such as
1/2/3.

Complete:

```text
BEGIN IMMEDIATE
-> update run_tasks
     set status = completed,
         completed_at = now,
         updated_at = now,
         version = version + 1
   where id = taskId
     and status = pending
     and version = expectedVersion
COMMIT
-> request Glance widget redraw
```

If the update count is `0`, treat it as a stale widget action. Do not invent a
success state; redraw from the current Room state.

Undo complete:

```text
BEGIN IMMEDIATE
-> update run_tasks
     set status = pending,
         completed_at = null,
         updated_at = now,
         version = version + 1
   where id = taskId
     and status = completed
     and version = expectedVersion
COMMIT
-> request Glance widget redraw
```

Use the same stale-action rule for undo. This prevents a delayed undo from
reverting a task that has since moved through another valid state transition.

If the transaction fails, the widget redraw must not pretend the operation
succeeded. The next redraw should come from the unchanged task state.

This failure policy is defensive, not a reason to add a widget action journal in
Phase 0. SQLite/Room writes can fail because of disk full, database corruption,
permission/storage errors, or process death around the callback. These are
device-level failures rather than a special widget data-model problem. Phase 0
handles them by keeping a single source of truth, using the task `version` as a
compare-and-swap guard, and redrawing from Room. Do not add CDC-like action
tables only to cover this path.

Complete and undo are short `ActionCallback` paths in Phase 0:

```text
Room transaction
-> Glance update
```

Do not introduce WorkManager unless the operation becomes long-running or needs
deferred/background work beyond the widget callback.

## Widget Layout Rule

Phase 0 uses Glance rather than raw `RemoteViews`.

Widget body:

- Render the focus list with Glance `LazyColumn`.
- Use two stable row heights: one for one-line task titles and one for two-line
  task titles. Do not force short tasks into the taller two-line row, because it
  wastes density and makes the widget feel less cue-like. Avoid fully fluid row
  heights so the list still scans predictably.
- Truncate long task titles before rendering because Glance 1.2.0 does not expose
  Text overflow/ellipsis controls equivalent to Compose Text.
- Treat the whole widget row as the complete tap target. The checkbox glyph is a
  quiet signifier, not the only tappable area.
- Keep completed tasks in the same focus position and render them as checked,
  muted, and undoable in app UI if that UI shows completed tasks.
- Hide completed tasks from the widget body and show the most recent widget
  completion as a temporary lower-left undo affordance.
- Treat the left dot as priority. Express priority with size and opacity/strength,
  not with category color.
- Keep the priority dot visually separate from category color. The top cue should
  be larger and stronger, the second cue medium, and the remaining cues small and
  quiet so priority can be read without labels.
- Treat the right rail as category. Category color belongs to the rail, not to
  the priority dot.
- Do not branch domain behavior on widget size or aspect ratio. Size changes
  should only change how much of the same ordered focus list is visible before
  scrolling.

Widget footer:

- Do not use raw `RemoteViews` only to get horizontal scrolling. A direct
  `HorizontalScrollView` experiment failed on the Pixel emulator launcher with
  `Class not allowed to be inflated android.widget.HorizontalScrollView`.
- Keep the footer visible.
- Show compact category tips as direct controls. Tapping a category tip filters
  the body to that category's cues; tapping the same category again returns to
  the full focus list. Render the category tips as one continuous strip and let
  the launcher/widget bounds clip the right side if the strip is wider than the
  available footer width.
- Keep a right-edge advance button visible as an affordance for hidden
  categories. It should advance the strip by one category, not by a fixed page
  size.
- Do not render categories as dots. Use text with a short fixed-width color mark
  behind the lower half of the label for the tappable category affordance and
  selected text color for the active filter. The mark should be a separate,
  slightly transparent visual element rather than native text underline so it
  can overlap the text without making the label hard to read.
- Store selected category and temporary undo state in Glance widget state, not
  in the domain database.
- Keep footer category spacing content-like, not stretched across the full width
  with equal weights.
- Size category tips close to the visible label width with a conservative
  Japanese glyph estimate plus min/max bounds. Avoid equal fixed-width boxes,
  because their invisible slack makes the visible gaps between categories look
  uneven.

This keeps widget UI state separate from task state. Mock data may include
extreme task and category strings, but those samples should live in seed/fixture
code and flow through the same `FocusCue` projection as real data.

## Appearance Settings

Appearance settings are preference state, not task/domain state.

The app supports:

- system theme
- light theme
- dark theme

The widget supports:

- follow app/system
- light theme
- dark theme

The widget also supports a small text-density choice:

- compact
- standard
- large

This should remain a constrained choice set rather than an arbitrary slider. The
setting adjusts one-line row height, two-line row height, title size, truncation
length, priority mark size, category rail size, and footer category mark width
together so the widget keeps a coherent density. Android's system font scale
still applies on top of these choices.

## Open Design Tasks

Track these as product/design tasks before turning the current widget treatment
into shared implementation patterns:

- Define the priority scale. Decide how many priority levels Cuckoo Cue actually
  needs, what each level means to the user, and how strongly each level should be
  expressed through dot size, color strength, opacity, and row emphasis. The goal
  is to make priority legible without making the widget feel like a generic todo
  list or a warning panel.
- Define reusable cue UI elements. Extract the visual roles that should stay
  consistent across widget and app surfaces: priority mark, category rail,
  category tip, temporary undo affordance, complete affordance, row highlight,
  and truncation behavior. Each element should have a clear responsibility before
  it becomes a shared component or token.
- Re-evaluate the footer category tip mark after visual testing. Phase 0 uses a
  short fixed-width translucent mark, roughly one character wide, behind the
  lower half of the text because it reads as a quiet category mark instead of a
  tab-like underline. Keep the tap target on the full label either way.
- Decide whether appearance controls stay in the main screen during Phase 0 or
  move behind a compact settings affordance once the core task flow becomes more
  complete.
- Decide whether temporary undo needs a time-based expiry or only interaction
  expiry in Phase 0. It must appear after a successful complete, and it must
  clear on undo, later widget interactions, app-side task/focus mutation, or app
  launch. Exact seconds are optional unless user testing shows stale undo is
  confusing.

## What Not To Add For Phase 0

Do not add these unless a concrete feature requires them:

- `WidgetAction`
- `AppliedAction`
- `local_actions`
- `drain_checkpoints`
- separate `widget_gateway.sqlite`
- CDC or generic sync outbox
- event sourcing
- multi-step undo history

These structures solve different problems than Phase 0 has. Phase 0 only needs
atomic local task-state updates and widget redraw from that state.

## Web Save/Search Decisions

The web application is a save and search surface. It is not the active execution
surface.

Web/API responsibilities:

- Search reusable task-list entries.
- Save completed Android runs as reusable entries.
- Hand selected entries off to Android through an import/app-link flow.

Android/Widget responsibilities:

- Execute the active task list locally.
- Own complete, undo, task editing, focus order, widget state, and redraw.
- Export a completed run snapshot when the user chooses to save it.

Saving and publishing are the same event for now. When a completed run is saved,
it becomes part of the reusable search corpus immediately. Do not add
`published_at`, `visibility`, public/private variants, moderation tables, or
curator workflow until the product has a separate review or privacy lifecycle.

User memory is handled by Google Cloud Memory Bank, not by BigQuery. BigQuery is
the reusable task-list corpus. Memory Bank is the user-scoped profile/memory
source used at search/import time.

## BigQuery Task List Entries

Store one completed task-list snapshot per row. Use a repeated struct for tasks;
the array offset is the task order. A row is a reusable corpus entry, not an
active Android run.

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

Column decisions:

- `id` is required because search results, detail routes, Android import, and
  later enrichment need a stable row identifier.
- `owner_user_id` comes from the auth layer. BigQuery does not own auth or user
  profiles.
- `title` is the saved list's display name and an explicit-search target.
- `tasks.text` is the reusable task text. Android imports it as
  `run_tasks.title`.
- `tasks.default_priority` is optional. It is an import hint for Android focus
  order or widget emphasis, not an immutable importance label. Because the user
  approves the saved snapshot, the value is both observed and recommended.
- `tasks.relative_start_day` and `tasks.relative_end_day` are optional whole-day
  offsets from the import-time `target_anchor_day`. Users may enter absolute
  dates in Android, but reusable entries store portable relative ranges. Use
  `relative_end_day = 0` for a task that should finish on the target day.
- `domain` is nullable and LLM-enriched after save. Keep it coarse, such as
  `引っ越し`, `端末移行`, or `旅行準備`. Locale, rules, services, and
  situation-specific constraints belong in `context_text`, not in an overly
  specific domain. `domain` is not a widget color category.
- `context_text` is nullable and LLM-enriched after save. It describes the
  situation where the completed list was useful. It should preserve reusable
  local rules, services, institutions, and constraints when they affect whether
  the task list is a good match. It must be derived from the task-list snapshot,
  not from the searching user's Memory Bank profile.
- `task_groupings` is nullable and LLM-enriched after save. It groups existing
  task offsets without changing `tasks`. Its granularity is an LLM-generated
  preview/import aid; do not over-specify group counts in the schema.
- `context_embedding` is a derived search field for the entry context. Do not
  include it in Android import payloads.
- `created_at` is the time the completed snapshot entered the corpus.

Do not add a separate `search_documents` table by default. If cached search text
or embeddings become necessary, treat them as derived implementation details of
`task_list_entries`, not as a separate product concept.

Search has two matching roles:

```text
Explicit user request
-> match against title, domain, and tasks.text

User message context + Memory Bank user profile
-> match against domain, context_text, and task_groupings.label
```

The user message remains the strongest signal. Memory Bank profile data is a
soft sorting signal, not a hard filter. If the query explicitly asks for "London
to Brighton moving", a Japanese locale profile must not filter out UK-moving
entries; it may only break ties or adjust ranking when the query is ambiguous.

## Memory Bank Update Events

Use Google Cloud Memory Bank for long-term user memory/profile. Its official
docs support user-scoped memories, LLM-based extraction and consolidation,
asynchronous generation, continuous event ingestion, event-id deduplication,
similarity retrieval, and memory profiles:

- https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/ingest-events
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/fetch-memories
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/profiles

Send meaningful app/API operations to Memory Bank as asynchronous events. Do not
store user profile rows in BigQuery just to support search; retrieve relevant
Memory Bank memories/profile at search/import time and pass them into ranking.

The Memory Bank profile is user-side context for loose similarity sorting. It is
not the task-list corpus, and it does not contain `domain`. Keep domain and
reusable task context in BigQuery; keep user attributes and preferences in Memory
Bank.

Initial profile shape:

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

These fields are intentionally broad. They may be short natural-language
attributes rather than tightly enumerated values. Do not add confidence,
durability, sensitivity, or evidence fields to the app-facing schema for the
initial version; profile-derived signals are handled as weak ranking inputs
rather than as deterministic rules.

Examples:

```text
locale_context:
  日本在住で、日本語の手続き説明を優先する。

household_context:
  単身の予定を扱うことが多い。

work_context:
  平日日中に電話や役所手続きを入れにくい。

device_context:
  Android phone と Google アカウント中心。

mobility_context:
  車を前提にしない計画を好む。

scheduling_context:
  週末にまとめて処理できる並びを好む。

channel_preferences:
  電話よりオンライン手続きを優先する。

planning_preferences:
  最初に全体像を見てから直近 task に絞る。

task_preferences:
  曖昧な確認 task より、実行可能な具体 action を好む。
```

These attributes are allowed to be incomplete, stale, or absent. Search should
still work from the user query and BigQuery context alone.

Memory event scope:

```text
scope = { user_id: <auth user id> }
stream_id = "cuckoo-cue-user-profile"
event_id = stable operation id
```

Events to ingest:

- Android app task add/edit/delete.
- Android app task reorder.
- Android app priority change.
- Android app relative date/range change.
- Android app focus adjustment when done from the app.
- Android app save completed run, only when the event wording is useful for
  user-profile attributes rather than a copy of the task-list corpus.

Events to defer until there is a clearer profile signal:

- Web search request.
- Web search result selection/import request.

Events not to ingest:

- Widget complete.
- Widget undo.
- Widget category filter changes.
- Widget scroll or resize.
- Widget temporary undo display.
- Widget theme or text-density changes.

Widget interactions are low-context execution gestures. They should update local
task state when appropriate, but they should not directly train or update user
memory. Their effects may still appear indirectly in the final completed run
snapshot if the user saves that run.

Do not ingest web search queries directly as long-term profile events in the
initial version. A search query is usually a task-specific intent. It should
shape the current search, but it should not automatically become durable user
profile. Result selection may become a profile signal later, but it needs a
clearer interpretation than "the user clicked this".

## Cross-Surface Data Flow

The reusable corpus and local execution state are different objects. A BigQuery
row is never the active task list that the widget mutates.

```text
1. Search

   Web user message
   + Memory Bank retrieval for the same user scope
        |
        v
   Search/ranking over BigQuery task_list_entries


2. Import

   task_list_entries row
        |
        v
   Android import/app-link payload
   - source_task_list_entry_id = id
   - title
   - tasks.text
   - tasks.default_priority
   - tasks.relative_start_day
   - tasks.relative_end_day
   - relative_day_anchor = target_anchor_day
   - optional preview metadata: domain, context_text, task_groupings


3. Materialize locally

   Android Room runs
   - title copied from the entry
   - source_task_list_entry_id may be retained when import/sync exists

   Android Room run_tasks
   - title = tasks.text
   - sort_order = tasks array offset
   - status = pending
   - version = 0
   - default_priority copied if Android supports priority
   - absolute schedule derived from target_anchor_day and relative day range
     if Android supports scheduling

   Android Room focus_assignments
   - generated locally from task order and default_priority


4. Execute

   Android app
   - edit tasks
   - reorder/focus tasks
   - complete/undo with version CAS

   Widget
   - read Room focus cues
   - complete/undo local tasks
   - redraw from Room

   The source BigQuery row is not mutated.


5. Save again

   Completed Android run
        |
        v
   Save API
        |
        v
   INSERT new task_list_entries row
   - title from the final run
   - tasks from final run task titles in sort_order
   - default_priority and relative_start_day/relative_end_day if supported
   - owner_user_id from auth
   - domain/context_text/task_groupings may start null


6. Enrich

   LLM enrichment fills or improves:
   - domain
   - context_text
   - task_groupings

   Enrichment affects future searches/import previews. It does not rewrite
   already materialized Android runs.
```

## Save/Search UX Risks

- Users may experience an imported list and its source as "the same list" even
  though the system treats them as a reusable snapshot and a local execution
  copy. The import and save UI should make this snapshot boundary feel natural.
- Saving a completed run inserts a new corpus row. Repeated similar completions
  can create near-duplicate search results unless ranking or clustering handles
  them later.
- Because saving equals publishing, the save UI must make it clear that the
  task list becomes searchable. This is especially important before redaction or
  moderation exists.
- LLM-generated `domain`, `context_text`, and `task_groupings` can be wrong or
  overconfident. They should be treated as search/preview aids, not as hard
  execution requirements.
- `context_text` should describe the completed list's situation, not the
  searching user's private Memory Bank contents. The UI must avoid implying that
  private memory is saved into the public corpus.
- `default_priority` should remain an initial ordering hint. Users should be
  able to adjust Android focus/order without feeling that the system has judged
  a task's objective importance.
- Relative day ranges are reusable but coarse. Android must ask for or derive
  the user's `target_anchor_day` before converting them to absolute dates, and
  should avoid pretending the saved list already knows the user's real-world
  due dates.
- Memory Bank profile may over-personalize ranking if it is treated as a hard
  filter. Keep it as a soft similarity/sorting input.
- Web is search/save only. If web result pages look editable or runnable, users
  may expect task execution there. The handoff to Android should be explicit.
- Excluding widget events reduces memory noise, but it also means quick widget
  behavior does not directly personalize future ordering. This is intentional
  unless later evidence shows app-only events are too sparse.

## Web Save/Search Verification Status

The current scripted web scenarios are useful smoke tests, not final product
validation. Treat them as evidence that the API path can work, not as evidence
that the ranking and enrichment design is finished.

Verified:

- A completed-run-shaped payload can be saved through the web API.
- LLM enrichment can produce `domain`, `context_text`, and `task_groupings`.
- `context_embedding` can be generated and stored with the BigQuery row.
- A search request can retrieve Memory Bank context and rank BigQuery entries.
- The search response exposes separate `match_score`, `context_match_score`, and
  `similarity_score`.
- Import payload generation preserves task order, `default_priority`,
  `relative_start_day`, `relative_end_day`, and `relative_day_anchor`.
- Comparison data for Tokyo to Nagoya and London to Brighton produced different
  top results when the query was specific.

Not yet validated:

- Whether the coarse `domain` plus richer `context_text` split is better than a
  more specific domain in a larger corpus.
- Whether Memory Bank user attributes improve ordering without overriding clear
  query intent.
- Whether profile-derived similarity should affect only tie-breaking or a larger
  part of the score.
- Whether the current score weights and similarity threshold hold across
  positive and negative examples.
- Whether Japanese, English, and mixed-language task text search well enough
  without additional normalization.
- Whether LLM-generated task groupings are useful in the Android import UI.
- Whether the save UI makes it clear that saving adds the completed run to the
  reusable search corpus.
- Whether duplicated or near-duplicated saved runs become noisy.

Earlier smoke tests should therefore be described as "API/data-flow passed" or
"scenario passed", not as "search quality is complete". The next evaluation
should focus on data quality and ranking behavior rather than another simple
happy-path save/search/import pass.

## Future Sync Boundary

Future sync should not be inferred from SQLite row changes. If sync becomes
necessary, express it as explicit domain commands at the app/server boundary,
such as:

```text
completeTask(taskId, expectedVersion)
undoComplete(taskId, expectedVersion)
snoozeFocus(taskId, until, expectedVersion)
```

This keeps the domain model state-centered. It avoids a homegrown CDC pipeline
and lets conflict rules live in the command/API layer rather than in local DB
plumbing.

## Future Snooze

When snooze is implemented, do not overwrite structural availability.

Keep separate meanings:

- task availability: when the run/playbook says a task can be done
- focus snooze: when the user temporarily hides a task from the widget

Add fields only when the feature exists. A likely future shape is:

```text
run_tasks.available_from
focus_assignments.snoozed_until
```

Widget selection should consider both.

## Verification

Scripted checks:

- Run `android/scripts/verify-widget-phase0.sh` for the Phase 0 verification
  pass. It builds and installs the debug APK, runs instrumentation checks, resets
  seed data through a debug-only receiver, exercises widget complete/undo/footer
  interactions, captures scroll screenshots, and captures narrow/wide/short/tall
  screen-profile screenshots.
- Use `RUN_INSTRUMENTATION=0 android/scripts/verify-widget-phase0.sh` while
  iterating on home-screen screenshots.
- The script requests widget pinning through the debug-only `PinWidgetActivity`
  and confirms the widget is bound to Pixel Launcher before interaction
  screenshots. If the launcher rejects pinning, it falls back to Pixel Launcher
  widget-picker automation.
- Launcher resize handles are host-owned. The script attempts a Pixel Launcher
  resize-handle smoke check and records `launcher-widget-resize-*` screenshots.
  On emulator builds where ADB long-press injection is treated as a home-screen
  long-press instead of a widget-resize gesture, the script records that as a
  non-fatal host automation gap. Set `RUN_STRICT_LAUNCHER_RESIZE=1` to make that
  gap fail the run.

Minimum Phase 0 checks:

- Complete a task from the widget and verify the app shows it completed.
- Complete a task from the app and verify the widget redraws from the same
  state.
- Undo complete and verify the task returns to pending.
- Kill/restart after complete and verify the task state remains correct.
- Kill/restart after undo and verify the task state remains correct.
- Kill after DB commit and before Glance redraw, then verify app restart
  `updateAll()` catches the widget up to Room state.
- After that stale widget redraw window, complete again from the old widget and
  verify the CAS update count is `0` and the widget redraws current state.
- Complete the same task concurrently from app and widget.
- Run complete, undo, complete in quick succession.
- Simulate DB write failure and verify the widget does not show a fake success.
  The Phase 0 instrumentation suite covers this at the repository contract
  level by making SQLite writes fail and asserting that complete/undo are
  reported as unsuccessful.
- Reboot/emulator restart and verify the widget redraws from local task state.
- Verify the widget can scroll vertically when the focus list has more items
  than fit in the current widget height.
- Verify narrow, wide, short, and tall widget bounds. Use screen-profile
  screenshots as the baseline scripted check, then verify launcher-owned widget
  resize handles manually or with `RUN_STRICT_LAUNCHER_RESIZE=1` once the target
  launcher accepts scripted resize gestures. The same focus list should remain
  scrollable, long labels should truncate, and the footer category strip should
  clip naturally when it exceeds the available width.
- Verify launcher differences with at least Pixel Launcher and one OEM launcher
  or launcher substitute. Check scroll behavior, row tap target, footer category
  taps, right-edge category advance, rounded background, and resize behavior.
- Verify extreme sample data: very short task titles, very long task titles,
  many focused tasks, short category labels, long category labels, and many
  category labels.
- Verify footer category filtering from the widget: tap a category to show only
  matching cues, then tap it again to return to the full list.
- Verify footer category spacing stays natural when many category tips are
  rendered in one strip.
- Verify the right-edge category advance button stays visible and advances the
  category strip by one item.
- Verify widget complete hides the cue from the body and shows a temporary
  lower-left undo affordance.
- Verify app theme modes: system, light, and dark.
- Verify widget theme modes independently from the app: follow app/system,
  light, and dark.
- Verify widget text scale modes: compact, standard, and large.
