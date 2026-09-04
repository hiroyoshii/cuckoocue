# Cuckoo Cue Android Design Doc

## Product Shape

Cuckoo Cue is not a task-management system. It is a small home-screen surface
for bringing back cues at the moment they can be acted on.

The Android loop is:

```text
create or start a small run
-> keep that run's light task list
-> priority/due date decides which tasks become widget cues
-> complete from the widget or app
-> redraw from the current local task state
```

Android owns the active execution state. Web search/save and Memory Bank work
are parallel tracks; they do not decide widget or local task behavior.

Room is the immediate device state, while authenticated run snapshots are synced
through the Web API to Firestore under `users/{uid}/runs/{run_id}`. This sync is
part of the cross-surface product architecture even though Phase 0 originally
validated local behavior first. Widget operations participate in run sync but
remain excluded from Memory Bank events.

The app UI is list-scoped for users: each internal run is shown as its own
small list, but user-facing copy should not expose "Run" or "Cue" as navigation
concepts. Task rows reuse the widget row language so the app and widget feel like
the same tool. The home-screen widget is the cross-list cue surface.

## Phase 0 Scope

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
- Run-scoped task lists in the app
- One resizable Android widget that can scroll through its cues
- Complete
- Undo complete
- Local crash/restart verification

Phase 0 defers:

- Skip
- Snooze
- Multi-device conflict resolution and restore UI
- iOS widgets
- WorkManager for widget complete/undo

## State Model

The essential local state is task state plus a widget cue cache.

Minimum tables:

- `runs`
- `run_tasks`
- `widget_cues`

`widget_cues` is a Room table, but conceptually it is not a domain entity. It is
the local projection/cache the widget reads so it can render the current cue
set without re-deciding task exposure inside the widget process. A small widget
may only show a few rows at a time, but the data model must not impose a
three-item limit.

During the validation stage, schema changes may destructively recreate the local
SQLite database. Do not carry migration code until there is user data worth
preserving.

## Table Purposes

`runs` groups a small set of tasks.

```text
id
title
sort_order
archived_at
created_at
updated_at
```

`archived_at = null` means the run is still active in the app. A non-null
`archived_at` means the run has left the current working surface. Do not use a
separate run status for Phase 0.

`run_tasks` stores task content and lifecycle:

```text
id
run_id
title
user_priority  -- nullable user override for cue exposure strength
due_at          -- optional deadline/available-time source for exposure
sort_order
completed_at
created_at
updated_at
```

`completed_at = null` means the task is not completed. A non-null
`completed_at` is the completion fact; do not also store a separate task status
for Phase 0.

`title` is the main user input. Phase 0 has no separate category field or
category entry UI. If the widget needs footer grouping labels, derive them from
the task title or imported/generated text; do not make the user maintain a
category system.

Cue priority means exposure strength, not objective importance. It is computed
from `due_at` by default, and the user can override it with `user_priority`.

Use a small three-step exposure scale:

- `0`: strong cue
- `1`: medium cue
- `2`: quiet cue; no immediate timing pressure

`user_priority = null` means the app uses the `due_at`-based computed priority.
`user_priority = 0 | 1 | 2` means the user-chosen exposure strength wins.
Changing `due_at` may change computed priority only when `user_priority` is
null.

`widget_cues` stores the widget-facing cache rows:

```text
run_id
task_id
priority
created_at
updated_at
```

Constraints:

```text
UNIQUE(task_id)
FOREIGN KEY(task_id) REFERENCES run_tasks(id) ON DELETE CASCADE
```

`run_id` and `priority` are intentionally duplicated from the task side because
this table is the widget projection/cache. Do not store truncated display text
in `widget_cues`; text fitting depends on widget bounds and text-size settings.
The widget reads the task title when rendering.

Maintain `widget_cues` inside the same Room transaction as the task or run
mutation that changes widget exposure. Add/update/remove only the affected
cache rows in the normal path. Keep a full rebuild available only as a
repair/test utility, not as the default response to every edit.

For Phase 0, do not add snooze fields. Add them only when snooze exists as a
real feature.

## Cue Lifecycle

The product lifecycle should be described in cue terms:

```text
task exists
-> task becomes worth surfacing
-> task is projected into widget_cues
-> user handles the cue
-> completed cue leaves the visible widget body
-> a short-lived undo affordance may restore it
```

There are two separate facts:

- completing a task: setting `run_tasks.completed_at`
- exposing a task in the widget: inserting/updating its `widget_cues` row

This distinction is intentional. A task can exist without being surfaced, and a
surfaced cue can be completed.

Phase 0 rule:

- Complete removes the task from `widget_cues`.
- Undo clears `completed_at` and then restores that task's `widget_cues` row
  only when the task's current effective priority is visible.
- `effective priority = quiet` removes the task from `widget_cues`.
- `effective priority = medium | strong` creates or updates the task's `widget_cues`
  cache row.
- Undo may keep temporary UI-only position information in Glance state, but do
  not persist widget order only for undo.

Do not introduce durable history only to support a short undo. For Phase 0, undo
only needs to reverse the most recent successful complete while the temporary
affordance is visible.

## Complete And Undo

Widget and app complete/undo update the same local database.

Complete:

```text
update run_tasks
   set completed_at = now,
       updated_at = now
 where id = taskId
   and completed_at is null

delete from widget_cues
 where task_id = taskId
```

Undo complete:

```text
update run_tasks
   set completed_at = null,
       updated_at = now
 where id = taskId
   and completed_at is not null

insert or replace widget_cues(...)
-- only when the task's effective priority is still visible
```

Widget cue order is computed at read time:

```text
effective_priority asc
due_at asc nulls last
run.sort_order asc
run_tasks.sort_order asc
run_tasks.created_at asc
```

If the update count is `0`, treat the tap as stale and redraw from the current
Room state. If the SQLite write fails, the widget must not show a fake success.

This is enough for Phase 0 because the active state is local and state-centered:

- one source of truth
- SQLite transaction behavior through Room
- redraw from Room after local mutation

## Widget Responsibility

Phase 0 uses Glance rather than raw `RemoteViews`.

The widget:

- reads widget cue cache rows from Room
- renders current cue rows
- treats the whole row as the complete tap target
- shows a quiet checkbox glyph as a signifier
- hides completed cues from the widget body
- shows the most recent successful widget completion as a temporary lower-left
  undo affordance
- stores selected footer filter and temporary undo UI state in Glance state
- redraws from Room after local mutation

The widget does not:

- seed production data
- own task selection policy
- maintain durable history
- train user memory
- branch domain behavior on widget size or aspect ratio

## App UI Responsibility

The app is where the user creates and edits the local lists that feed the
widget. It should feel like a lightweight list-of-lists, not a planning console
or a cross-run cue dashboard.

User-facing app language:

- Use simple list/task wording such as `リスト` and `項目`.
- Do not expose internal model words such as `Run`, `Runs`, or `Cue` in primary
  app navigation. The product name `Cuckoo Cue` may remain as branding.

List detail:

- Render one selected run's tasks as a dense vertical list.
- Show the run title at the top of the task list. Tapping the title turns it
  into an inline editor. Persist the title only on Enter, IME Done, or focus
  loss; do not write to SQLite on every character.
- Use the same base row vocabulary as the widget: quiet checkbox signifier,
  priority dot, title, drag handle, and a right-side overflow button. In the app
  list, the priority dot is overlaid on the checkbox control so the left edge is
  compact without pretending the content is simply left-aligned.
- Treat the task title as an edit target in the Android app. Title tap opens
  title editing only. Completion belongs to the checkbox signifier. Sorting
  belongs to the left-side drag handle, so checkbox and priority do not crowd
  the title start. The overflow button is the only target that opens due date,
  priority, save, and delete controls. This differs from the widget, where row
  taps stay optimized for quick completion.
- Show due dates as a short colored `M/d` label before the task title only when
  a due date exists. Keep the gap to the title minimal because color already
  separates the metadata from the title.
- The drag handle changes the run-local order. Dragging a task also
  updates that moved task's exposure strength to match the task now directly
  above it. Dropping at the top makes the moved task a strong cue. Do not add
  visible priority boundary lines or "top N" labels. During drag, reorder the
  visible list locally and persist to SQLite only once on drop. Tapping the drag
  handle moves a task one step up as a coarse fallback for touch/emulator cases.
- Tapping the task title starts inline title editing. The overflow button opens
  controls directly below the row for direct due-date input, priority strength,
  saving, and deletion.
- Editing priority in the inline controls updates the row's dot immediately.
  Saving persists it as an explicit exposure strength.
- Task creation submits on Enter/IME Done. The add row has no separate add
  button and does not show inactive checkbox, priority, or drag affordances
  before a task exists.
- Enter in an existing inline title edit saves the current task, even when the
  title is blank, then creates a new blank task directly below it and focuses
  that new row. Enter does not insert a multiline break.
- Blank task titles are valid in the app list because they support continuous
  capture. Render them as the muted `新しい項目` placeholder in the app.
- Blank task titles are excluded from the widget cue cache and from run-card
  previews. The home widget should never show an empty cue, and the app should
  not show a title-less preview dot.
- A further Backspace/Delete on an already blank inline title field deletes the
  task. The explicit `削除` control also deletes it.
- Completed tasks leave the pending section and appear in a collapsed completed
  section in the app. The widget body hides completed cues and only exposes a
  short temporary undo affordance after a completion.

Do not add the widget's cross-list context marks to list detail:

- No right category/grouping rail in the app task row.
- No category color grouping in the app list detail.
- No separate app cue surface for Phase 0.

The right rail and footer tips exist because the widget mixes cues from multiple
lists on the home screen. Inside one selected list, the list title already
provides that context.

## Widget Layout Rule

Widget body:

- Render the widget cue cache with Glance `LazyColumn`.
- Use two stable row heights: one for one-line titles and one for two-line
  titles.
- Truncate long titles before rendering because Glance 1.2.0 does not expose the
  same overflow controls as Compose Text.
- Treat the left dot as priority. Express priority with size and opacity/strength.
- Treat the right rail as a title-derived grouping hint if such a hint exists.
  Do not require the user to maintain it.
- Size changes should only change how much of the same ordered widget cue list is
  visible before scrolling.

Widget footer:

- Keep the footer visible.
- Footer tips are direct controls when title-derived grouping labels exist.
- Tapping a footer tip filters the body to matching cues; tapping it again
  returns to the full widget cue list.
- Render the tips as one continuous strip and let widget bounds clip the right
  side when the strip is wider than the footer.
- Keep a right-edge advance button visible for hidden tips. It advances by one
  tip, not by a fixed page size.
- Use text with a short fixed-width translucent mark behind the lower half of the
  label. The tap target remains the full label.
- Keep spacing content-like, not stretched across the full width.

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
setting adjusts row height, title size, truncation length, priority mark size,
context rail size, and footer mark width together so the widget keeps coherent
density. Android's system font scale still applies on top of these choices.

## Mainline Boundaries

Keep prototype and debug concerns outside the production app path:

- Keep seed/demo data in tests or debug-only verification paths.
- Keep undo restoration data temporary and small.
- Do not add category fields or category entry UI in Phase 0.
- Let users edit priority directly as a three-step exposure strength.

## Web Search And Save

The web application is a reusable task-list search and save surface. It does not
own active task execution. Android and the widget own active local task state.

BigQuery stores completed, reusable task-list entries:

```text
task_list_entries
- id STRING
- owner_user_id STRING
- title STRING
- tasks ARRAY<STRUCT<
    text STRING,
    default_priority INT64,
    relative_start_day INT64,
    relative_end_day INT64
  >>
- domain STRING
- context_text STRING
- task_groupings ARRAY<STRUCT<
    label STRING,
    task_offsets ARRAY<INT64>
  >>
- search_text STRING
- context_embedding ARRAY<FLOAT64>
- created_at TIMESTAMP
```

`domain` is coarse, such as `引っ越し` or `旅行準備`. Local rules, services,
institutions, language, and situation-specific constraints belong in
`context_text`. `task_groupings` is an LLM-generated import/preview aid over task
array offsets. `search_text` is a pre-tokenized search field for BigQuery
`SEARCH`, especially for Japanese queries. `context_embedding` is internal search
data and must not be included in Android import payloads.

Search follows a Query First plus Weak Profile shape:

```text
1. Retrieve user profile attributes from Memory Bank.
2. Retrieve distinct BigQuery domains for the user and cache them for one day.
3. Ask the LLM to map the current query to one existing domain, or null.
   The mapping must choose from the BigQuery domain list, not from a code enum.
4. Build one search context from:
   - current user query
   - user profile attributes
5. Generate one embedding for that mixed search context.
6. In one BigQuery query:
   - admit a row when `SEARCH(search_text, token)` matches at least one query token
   - also admit rows whose domain matches the mapped search domain
   - compute context_score as similarity between the mixed search context and
     the saved task-list context_embedding
   - order by mapped-domain match first, then context_score desc
```

Memory Bank profile attributes are weak context because they only affect ordering
inside the text-matched candidate set. Search does not store web search queries
or web result selections as memory events. Widget events are also excluded from
Memory Bank. Android app operations and completed-run save events may be sent as
raw Memory Bank events.

Risk: this design depends on the text-matched candidate set being narrow enough.
If a vague query or weak tokenizer admits unrelated candidates, a long or
task-specific Memory Bank profile can dominate the mixed context. Keep profile
attributes short, keep task-list content out of profile where possible, and
validate query examples where the same place appears across different domains,
such as moving to Tokyo versus traveling to Tokyo.

Search latency risk: query-to-domain mapping adds one LLM call per search.
Distinct domain retrieval is daily cached per user, but the mapping call itself
is not cached yet.

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
  and confirms the widget is bound to Pixel Launcher before screenshots. If the
  launcher rejects pinning, it falls back to Pixel Launcher widget-picker
  automation.
- Launcher resize handles are host-owned. The script attempts a Pixel Launcher
  resize-handle smoke check and records `launcher-widget-resize-*` screenshots.
  Set `RUN_STRICT_LAUNCHER_RESIZE=1` to fail if resize handles are not reachable
  through scripted touch input.
- Run `android/scripts/run-macrobenchmark.sh` for app responsiveness checks.
  This is intentionally a user-flow benchmark rather than a repository-only
  benchmark: isolated repository calls mostly measure Room/SQLite in a vacuum,
  while the product risk is startup, Compose recomposition, tap handling, frame
  timing, and widget redraw scheduling.
- Macrobenchmark seed data lives only in the `benchmark` source set. Do not add
  production startup seed logic for benchmark convenience.
- Treat emulator benchmark output as a regression smoke signal. Physical-device
  Macrobenchmark output is the decision-grade signal for whether app operations
  are consistently under the intended latency budget.

Minimum Phase 0 checks:

- Complete a task from the widget and verify the app shows it completed.
- Complete a task from the app and verify the widget redraws from the same
  state.
- Undo complete and verify the task returns to pending.
- Kill/restart after complete and verify the task state remains correct.
- Kill/restart after undo and verify the task state remains correct.
- Kill after DB commit and before Glance redraw, then verify app restart
  `updateAll()` catches the widget up to Room state.
- Complete the same task concurrently from app and widget.
- Run complete, undo, complete in quick succession.
- Simulate SQLite write failure and verify the widget does not show a fake
  success.
- Reboot/emulator restart and verify the widget redraws from local task state.
- Verify the widget can scroll vertically when the widget cue list has more items
  than fit in the current widget height.
- Verify narrow, wide, short, and tall widget bounds.
- Verify launcher differences with at least Pixel Launcher and one OEM launcher
  or launcher substitute.
- Verify extreme sample data: very short titles, very long titles, many widget
  cues, short footer labels, long footer labels, and many footer labels.
- Verify footer filtering from the widget.
- Verify footer spacing and right-edge advance.
- Verify widget complete hides the cue from the body and shows a temporary
  lower-left undo affordance.
- Verify app theme modes: system, light, and dark.
- Verify widget theme modes independently from the app: follow app/system,
  light, and dark.
- Verify widget text scale modes: compact, standard, and large.
