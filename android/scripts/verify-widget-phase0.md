# Widget Phase 0 Verification

Run from the repository root:

```bash
android/scripts/verify-widget-phase0.sh
```

To skip the slower instrumentation pass while iterating on home-screen
interaction screenshots:

```bash
RUN_INSTRUMENTATION=0 android/scripts/verify-widget-phase0.sh
```

The script covers every current Phase 0 verification item except cross-launcher
behavior:

- fresh seed app data through the debug-only reset receiver, without removing
  launcher widget placement
- Room instrumentation tests, including CAS and v1 -> v2 migration
- repository failure checks: committed Room state remains correct even if redraw
  has not happened yet, and SQLite write failures are not reported as completed
  widget actions
- row-level widget complete tap
- transient undo display and undo restore
- transient undo clearing on later widget interaction
- transient undo clearing on app launch
- app-side complete/undo redraw through the same repository and widget updater
- vertical scroll smoke check
- widget light/dark/follow-app and compact/standard/large text-density
  screenshots
- narrow, wide, short, and tall screen-profile smoke checks
- Pixel Launcher widget resize-handle smoke check. It attempts to enter launcher
  resize mode through ADB touch injection and records
  `launcher-widget-resize-small-*`, `launcher-widget-resize-wide-*`,
  `launcher-widget-resize-tall-*`, and `launcher-widget-resize-large-*`
  screenshots. Each profile also tries row-tap complete and undo with tap
  coordinates derived from the current launcher widget bounds. On some
  emulator/launcher builds, injected long-presses are treated as home-screen
  long-presses instead of widget resize gestures; set
  `RUN_STRICT_LAUNCHER_RESIZE=1` to fail in that case instead of recording it as
  a non-fatal host automation gap.

Optional reboot recovery check:

```bash
RUN_REBOOT=1 android/scripts/verify-widget-phase0.sh
```

Strict launcher resize check:

```bash
RUN_STRICT_LAUNCHER_RESIZE=1 android/scripts/verify-widget-phase0.sh
```

Screenshots are written to:

```text
android/build/widget-verification/
```

The tap coordinates are launcher/layout dependent. Override them with
environment variables when the widget is placed elsewhere:

```bash
ROW_TAP_X=260 ROW_TAP_Y=220 UNDO_TAP_X=130 UNDO_TAP_Y=665 \
FOOTER_NEXT_X=735 FOOTER_NEXT_Y=665 android/scripts/verify-widget-phase0.sh
```

The script can request widget pinning through the debug-only
`PinWidgetActivity`. If the launcher does not accept that request, the script
falls back to Pixel Launcher UI automation: long-press home, open Widgets, expand
Cuckoo Cue, and drag the widget onto the home screen. Launcher UI automation is
still host-specific; override coordinates or place the widget manually if a
different launcher changes the picker layout.
