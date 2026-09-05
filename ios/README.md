# Cuckoo Cue for iOS

The iOS 17+ app and WidgetKit extension mirror Android's cue candidates and ordering
while adapting the viewport to Apple's fixed widget families. App and extension
share a JSON snapshot through the `group.app.cuckoocue.shared` App Group.

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

The GitHub Actions workflow builds without signing, runs unit/UI tests, captures
Small, Medium, and Large previews from the iOS Simulator, and uploads the PNGs as
the `cuckoo-cue-ios-widget-screenshots` artifact.
