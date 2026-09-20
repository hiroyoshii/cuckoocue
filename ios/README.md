# Cuckoo Cue for iOS

The iOS 17+ app and WidgetKit extension mirror Android's cue candidates and ordering
while adapting the viewport to Apple's fixed widget families. App and extension
share a JSON snapshot through the `group.app.cuckoocue.shared` App Group.

The widget footer is run context, not a task-title filter. Unscoped widgets show
the all-runs context (`すべて`), scoped widgets show the configured run title, and
the row rail color is derived from the task's run ID.

The app keeps the top level focused on runs. Widget appearance and the live queue
preview are available from the Widget settings button.

Web handoff follows the same contract as Android: an authenticated
`https://cuckoocue.hiyozoo.com/import?run_id=...` link receives the existing run,
local and Widget changes are PUT back with the last ETag, and completed task IDs
are returned to the Web editor only after a successful sync. Sync ownership and
ETags are stored separately from the App Group domain snapshot so signing out or
switching accounts cannot reassign an existing run.

Home Screen widgets support Small, Medium, and Large layouts; the Lock Screen uses
the accessory rectangular family. Each instance can select a run and optionally
include quiet-priority items. Completion uses an interactive toggle, Small keeps an
inline undo row, larger widgets advance by a complete page, and non-control taps
deep-link to the configured queue. On iOS 18+, Cuckoo Cue also exposes a Control
Center and Action Button control that opens the queue.

## Generate and run

1. Install XcodeGen: `brew install xcodegen`.
2. Run `xcodegen generate --spec ios/project.yml` from the repository root.
3. Open `ios/CuckooCue.xcodeproj`.
4. Select a development team for both app and widget targets.
5. Register `group.app.cuckoocue.shared` for both bundle identifiers.

## Firebase and Universal Link setup

The repository intentionally does not contain production Firebase configuration.
To enable the account and Web handoff UI in a signed build:

1. Register the iOS bundle ID `app.cuckoocue.ios` in the existing `cuckoocue`
   Firebase project and download `GoogleService-Info.plist` to
   `ios/CuckooCue/GoogleService-Info.plist`.
2. Add the plist's `REVERSED_CLIENT_ID` as a URL scheme in the CuckooCue target.
   Keep the existing `cuckoocue` scheme used by the Widget.
3. Enable Associated Domains for the app ID. `project.yml` already declares
   `applinks:cuckoocue.hiyozoo.com`.
4. Serve an Apple App Site Association file for `/import` from that host using
   the selected Apple Team ID and `app.cuckoocue.ios` bundle ID.

Without the plist the app still builds and local/Widget features work, but the
account sheet explicitly reports that Web transfer authentication is unavailable.

The GitHub Actions workflow builds without signing, runs unit/UI tests, captures
Small, Medium, Large, scoped-run, paged, and multi-run previews from the iOS
Simulator, and uploads the PNGs as the `cuckoo-cue-ios-widget-screenshots`
artifact.
