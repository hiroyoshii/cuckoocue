# Cuckoo Cue for iOS

The iOS 17+ app and WidgetKit extension mirror the Android cue experience while
using fixed Apple widget families. App and extension share a JSON snapshot through
the `group.app.cuckoocue.shared` App Group.

## Generate and run

1. Install XcodeGen: `brew install xcodegen`.
2. Run `xcodegen generate --spec ios/project.yml` from the repository root.
3. Open `ios/CuckooCue.xcodeproj`.
4. Select a development team for both app and widget targets.
5. Register `group.app.cuckoocue.shared` for both bundle identifiers.

The GitHub Actions workflow builds without signing, runs unit/UI tests, captures
Small, Medium, and Large previews from the iOS Simulator, and uploads the PNGs as
the `cuckoo-cue-ios-widget-screenshots` artifact.

