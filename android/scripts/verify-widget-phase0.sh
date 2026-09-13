#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADB="${ADB:-/home/hiroyoshii/Android/Sdk/platform-tools/adb}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/build/widget-verification}"
PACKAGE="app.cuckoocue"
MAIN_ACTIVITY="$PACKAGE/.MainActivity"
PIN_ACTIVITY="$PACKAGE/.debug.PinWidgetActivity"
RESET_SEED_ACTION="$PACKAGE.debug.RESET_SEED"
RESET_MANY_RUNS_ACTION="$PACKAGE.debug.RESET_MANY_RUNS"
COMPLETE_FIRST_PENDING_ACTION="$PACKAGE.debug.COMPLETE_FIRST_PENDING"
UNDO_FIRST_COMPLETED_ACTION="$PACKAGE.debug.UNDO_FIRST_COMPLETED"
SET_APPEARANCE_ACTION="$PACKAGE.debug.SET_APPEARANCE"
VERIFICATION_RECEIVER="$PACKAGE/.debug.VerificationReceiver"

ROW_TAP_X="${ROW_TAP_X:-260}"
ROW_TAP_Y="${ROW_TAP_Y:-220}"
UNDO_TAP_X="${UNDO_TAP_X:-130}"
UNDO_TAP_Y="${UNDO_TAP_Y:-665}"
FOOTER_NEXT_X="${FOOTER_NEXT_X:-735}"
FOOTER_NEXT_Y="${FOOTER_NEXT_Y:-665}"
WIDGET_SCROLL_START_X="${WIDGET_SCROLL_START_X:-360}"
WIDGET_SCROLL_START_Y="${WIDGET_SCROLL_START_Y:-520}"
WIDGET_SCROLL_END_X="${WIDGET_SCROLL_END_X:-360}"
WIDGET_SCROLL_END_Y="${WIDGET_SCROLL_END_Y:-250}"
RUN_LAUNCHER_RESIZE="${RUN_LAUNCHER_RESIZE:-1}"
RUN_STRICT_LAUNCHER_RESIZE="${RUN_STRICT_LAUNCHER_RESIZE:-0}"

mkdir -p "$OUT_DIR"

adb_shell() {
  "$ADB" shell "$@"
}

debug_broadcast() {
  local action="$1"
  shift
  adb_shell am broadcast -n "$VERIFICATION_RECEIVER" -a "$action" "$@" >/dev/null
}

screenshot() {
  local name="$1"
  local target="$OUT_DIR/$name.png"
  local tmp="$OUT_DIR/$name.tmp.png"
  local device_target="/sdcard/cuckoo-cue-$name.png"
  rm -f "$tmp"
  if timeout 20s "$ADB" exec-out screencap -p > "$tmp" && [ -s "$tmp" ]; then
    mv "$tmp" "$target"
  else
    rm -f "$tmp"
    timeout 20s "$ADB" shell screencap -p "$device_target"
    timeout 20s "$ADB" pull "$device_target" "$target" >/dev/null
    timeout 10s "$ADB" shell rm "$device_target" >/dev/null 2>&1 || true
  fi
  echo "screenshot: $OUT_DIR/$name.png"
}

wait_home() {
  sleep "${1:-3}"
}

start_app() {
  adb_shell am start -n "$MAIN_ACTIVITY" >/dev/null
}

restart_app_fresh() {
  adb_shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
  sleep 1
  start_app
  wait_home "${1:-4}"
}

home() {
  adb_shell input keyevent KEYCODE_HOME
  wait_home 5
}

tap() {
  adb_shell input tap "$1" "$2"
  sleep "${3:-2}"
}

swipe_widget() {
  adb_shell input swipe \
    "$WIDGET_SCROLL_START_X" "$WIDGET_SCROLL_START_Y" \
    "$WIDGET_SCROLL_END_X" "$WIDGET_SCROLL_END_Y" \
    450
  sleep 2
}

reset_screen_profile() {
  adb_shell wm size reset >/dev/null
  adb_shell wm density reset >/dev/null
}

ui_text_bounds() {
  local text="$1"
  adb_shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || return 1
  "$ADB" exec-out cat /sdcard/window.xml |
    tr '>' '\n' |
    grep -F "text=\"$text\"" |
    head -n 1 |
    sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p'
}

ui_resource_bounds() {
  local resource="$1"
  adb_shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || return 1
  "$ADB" exec-out cat /sdcard/window.xml |
    tr '>' '\n' |
    grep -F "resource-id=\"$resource\"" |
    head -n 1 |
    sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p'
}

ui_launcher_widget_bounds() {
  adb_shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || return 1
  "$ADB" exec-out cat /sdcard/window.xml |
    tr '>' '\n' |
    grep -F 'class="com.android.launcher3.widget.LauncherAppWidgetHostView"' |
    grep -F 'content-desc="Cuckoo Cue"' |
    head -n 1 |
    sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p'
}

tap_text() {
  local text="$1"
  local bounds
  bounds="$(ui_text_bounds "$text")"
  if [ -z "$bounds" ]; then
    return 1
  fi

  local left top right bottom
  read -r left top right bottom <<<"$bounds"
  adb_shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
  sleep "${2:-2}"
}

wait_tap_text() {
  local text="$1"
  local attempts="${2:-10}"
  local pause="${3:-1}"

  for _ in $(seq 1 "$attempts"); do
    if tap_text "$text" 2; then
      return 0
    fi
    sleep "$pause"
  done

  return 1
}

wait_for_text() {
  local text="$1"
  local attempts="${2:-15}"
  local pause="${3:-1}"

  for _ in $(seq 1 "$attempts"); do
    if ui_text_bounds "$text" >/dev/null; then
      return 0
    fi
    sleep "$pause"
  done

  return 1
}

drag_resource_to_home() {
  local resource="$1"
  local bounds
  bounds="$(ui_resource_bounds "$resource")"
  if [ -z "$bounds" ]; then
    return 1
  fi

  local left top right bottom
  read -r left top right bottom <<<"$bounds"
  adb_shell input swipe "$(((left + right) / 2))" "$(((top + bottom) / 2))" 260 640 2200
  sleep 5
}

show_widget_page() {
  home
  local display_size display_width display_height swipe_left swipe_right swipe_y
  display_size="$(adb_shell wm size | tail -n 1 | tr -d '\r' | awk '{print $NF}')"
  display_width="${display_size%x*}"
  display_height="${display_size#*x}"
  swipe_left=$((display_width / 10))
  swipe_right=$((display_width * 9 / 10))
  swipe_y=$((display_height / 2))
  if [ -n "$(ui_launcher_widget_bounds)" ]; then
    return 0
  fi

  # Check ordinary pages before swiping into the launcher's Discover feed.
  for _ in 1 2 3 4; do
    adb_shell input swipe "$swipe_right" "$swipe_y" "$swipe_left" "$swipe_y" 350
    sleep 2
    if [ -n "$(ui_launcher_widget_bounds)" ]; then
      return 0
    fi
  done

  for _ in 1 2 3 4; do
    adb_shell input swipe "$swipe_left" "$swipe_y" "$swipe_right" "$swipe_y" 350
    sleep 2
    if [ -n "$(ui_launcher_widget_bounds)" ]; then
      return 0
    fi
  done

  return 1
}

launcher_resize_mode_active() {
  adb_shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || return 1
  "$ADB" exec-out cat /sdcard/window.xml |
    tr '>' '\n' |
    grep -E 'widget_resize|Resize|Remove|App info|Cancel' >/dev/null
}

try_enter_launcher_resize_mode() {
  local bounds
  bounds="$(ui_launcher_widget_bounds)"
  if [ -z "$bounds" ]; then
    return 1
  fi

  local left top right bottom
  read -r left top right bottom <<<"$bounds"

  local center_x=$(((left + right) / 2))
  local center_y=$(((top + bottom) / 2))
  local near_left=$((left + 16))
  local near_right=$((right - 16))
  local near_top=$((top + 16))
  local near_bottom=$((bottom - 16))

  for point in \
    "$center_x $center_y" \
    "$near_left $near_top" \
    "$near_right $near_top" \
    "$near_right $near_bottom" \
    "$near_left $near_bottom"; do
    read -r press_x press_y <<<"$point"
    adb_shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
    sleep 1
    adb_shell input swipe "$press_x" "$press_y" "$press_x" "$press_y" 2200
    sleep 2
    screenshot "launcher-widget-resize-attempt-$press_x-$press_y"
    if launcher_resize_mode_active; then
      return 0
    fi
  done

  return 1
}

resize_current_widget_to() {
  local target_right="$1"
  local target_bottom="$2"
  local bounds

  bounds="$(ui_launcher_widget_bounds)"
  if [ -z "$bounds" ]; then
    return 1
  fi

  local left top right bottom center_x center_y
  read -r left top right bottom <<<"$bounds"
  center_y=$(((top + bottom) / 2))
  adb_shell input swipe "$right" "$center_y" "$target_right" "$center_y" 900
  sleep 2

  bounds="$(ui_launcher_widget_bounds)"
  if [ -z "$bounds" ]; then
    return 1
  fi

  read -r left top right bottom <<<"$bounds"
  center_x=$(((left + right) / 2))
  adb_shell input swipe "$center_x" "$bottom" "$center_x" "$target_bottom" 900
  sleep 3
}

capture_launcher_resize_profile() {
  local label="$1"
  local target_right="$2"
  local target_bottom="$3"

  if ! show_widget_page; then
    request_pin_widget || return 1
    show_widget_page || return 1
  fi
  if ! try_enter_launcher_resize_mode; then
    return 1
  fi

  resize_current_widget_to "$target_right" "$target_bottom"
  screenshot "launcher-widget-resize-$label-mode"
  adb_shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  sleep 2
  screenshot "launcher-widget-resize-$label"

  local bounds left top right bottom row_x row_y undo_x undo_y
  bounds="$(ui_launcher_widget_bounds)"
  if [ -z "$bounds" ]; then
    return 1
  fi
  read -r left top right bottom <<<"$bounds"
  row_x=$((left + 200))
  row_y=$((top + 125))
  undo_x=$((left + 70))
  undo_y=$((bottom - 45))

  tap "$row_x" "$row_y" 2
  screenshot "launcher-widget-resize-$label-after-row-tap"
  tap "$undo_x" "$undo_y" 2
  screenshot "launcher-widget-resize-$label-after-undo"
  home
}

run_launcher_resize_profile() {
  local label="$1"
  local target_right="$2"
  local target_bottom="$3"

  if capture_launcher_resize_profile "$label" "$target_right" "$target_bottom"; then
    return 0
  fi

  echo "Pixel Launcher resize profile '$label' did not complete through ADB touch injection." >&2
  screenshot "launcher-widget-resize-$label-failed"
  adb_shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  sleep 1
  if [ "$RUN_STRICT_LAUNCHER_RESIZE" = "1" ]; then
    exit 3
  fi
}

run_launcher_resize_smoke() {
  if [ "$RUN_LAUNCHER_RESIZE" != "1" ]; then
    return 0
  fi

  echo "== Pixel Launcher widget resize handle smoke check =="
  if ! show_widget_page; then
    echo "Cuckoo Cue widget is placed but not visible on the current launcher page." >&2
    screenshot "launcher-widget-resize-not-visible"
    if [ "$RUN_STRICT_LAUNCHER_RESIZE" = "1" ]; then
      exit 3
    fi
    return 0
  fi

  screenshot "launcher-widget-resize-before"
  if ! try_enter_launcher_resize_mode; then
    echo "Pixel Launcher resize handles were not reachable through ADB touch injection." >&2
    echo "Recorded launcher-widget-resize-attempt-* screenshots; use RUN_STRICT_LAUNCHER_RESIZE=1 to fail here." >&2
    if [ "$RUN_STRICT_LAUNCHER_RESIZE" = "1" ]; then
      exit 3
    fi
    adb_shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
    sleep 1
    return 0
  fi
  adb_shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  sleep 1

  run_launcher_resize_profile "small" 640 520
  run_launcher_resize_profile "wide" 1010 520
  run_launcher_resize_profile "tall" 640 1180
  run_launcher_resize_profile "large" 1010 1180
}

assert_widget_placed() {
  adb_shell dumpsys appwidget |
    awk '/^Widgets:/{in_widgets=1; next} /^Hosts:/{in_widgets=0} in_widgets {print}' |
    grep -q "app.cuckoocue.widget.CuckooCueWidgetReceiver"
}

request_pin_widget() {
  for attempt in 1 2; do
    echo "Trying widget pin request through Pixel Launcher API, attempt $attempt..."
    home
    adb_shell am start -n "$PIN_ACTIVITY" >/dev/null || true
    if wait_tap_text "Add to home screen" 15 1; then
      sleep 4
      if assert_widget_placed; then
        return 0
      fi
    fi
  done

  return 1
}

place_widget_pixel_launcher() {
  echo "Trying to place the widget through Pixel Launcher UI..."
  home

  local picker_opened=0
  for point in "540 1050" "540 900" "840 1050"; do
    if tap_text "Widgets" 2; then
      picker_opened=1
      break
    fi
    read -r press_x press_y <<<"$point"
    adb_shell input swipe "$press_x" "$press_y" "$press_x" "$press_y" 1800
    sleep 2
  done

  if [ "$picker_opened" -eq 0 ] && ! tap_text "Widgets" 3; then
    echo "Pixel Launcher Widgets menu was not found." >&2
    return 1
  fi

  local cuckoo_opened=0
  for _ in 1 2 3 4 5; do
    if tap_text "Cuckoo Cue" 2; then
      cuckoo_opened=1
      break
    fi
    adb_shell input swipe 540 2200 540 900 450
    sleep 1
  done

  if [ "$cuckoo_opened" -eq 0 ]; then
    echo "Cuckoo Cue entry was not found in the Pixel Launcher widget picker." >&2
    return 1
  fi

  adb_shell input swipe 540 2200 540 1450 500
  sleep 1
  if ! drag_resource_to_home "com.google.android.apps.nexuslauncher:id/widget_preview_container"; then
    adb_shell input swipe 540 1774 260 640 2200
  fi
  sleep 5
  adb_shell input keyevent KEYCODE_HOME
  sleep 2
}

ensure_widget_placed() {
  if assert_widget_placed; then
    return
  fi

  if request_pin_widget; then
    return
  fi

  place_widget_pixel_launcher
  if ! assert_widget_placed; then
    echo "Cuckoo Cue widget is not placed on the current launcher." >&2
    echo "Automatic placement did not complete. Place the widget once, then rerun this script." >&2
    exit 2
  fi
}

run_screen_profile() {
  local label="$1"
  local size="$2"
  local density="$3"

  adb_shell wm size "$size" >/dev/null
  adb_shell wm density "$density" >/dev/null
  sleep 2
  start_app
  wait_home 3
  home
  show_widget_page
  screenshot "resize-$label-before-scroll"
  swipe_widget
  screenshot "resize-$label-after-scroll"
}

echo "== Build, install, and run instrumentation checks =="
(
  cd "$ROOT_DIR"
  if [ "${RUN_INSTRUMENTATION:-1}" = "1" ]; then
    ./gradlew installDebug installDebugAndroidTest
    instrumentation_output="$OUT_DIR/instrumentation.txt"
    "$ADB" shell am instrument -w "$PACKAGE.test/androidx.test.runner.AndroidJUnitRunner" | tee "$instrumentation_output"
    if grep -E "Process crashed|FAILURES!!!|INSTRUMENTATION_RESULT: shortMsg=Process crashed" "$instrumentation_output" >/dev/null; then
      echo "Android instrumentation failed; see $instrumentation_output" >&2
      exit 1
    fi
  fi
  ./gradlew installDebug
)

echo "== Ensure the widget is placed =="
ensure_widget_placed
screenshot "after-pin-request"

echo "== Fresh seed data without removing launcher widget placement =="
debug_broadcast "$RESET_SEED_ACTION"
start_app
wait_home 6
home
wait_for_text "水" 20 1 || true
screenshot "fresh-home"

echo "== Widget row tap completes and shows transient undo =="
tap "$ROW_TAP_X" "$ROW_TAP_Y" 3
screenshot "after-row-tap-complete"

echo "== Undo restores the task and clears the transient affordance =="
tap "$UNDO_TAP_X" "$UNDO_TAP_Y" 3
screenshot "after-undo-tap"

echo "== Next widget interaction clears transient undo =="
tap "$ROW_TAP_X" "$ROW_TAP_Y" 2
tap "$FOOTER_NEXT_X" "$FOOTER_NEXT_Y" 2
screenshot "after-footer-next-clears-undo"

echo "== App launch clears transient undo =="
tap "$ROW_TAP_X" "$ROW_TAP_Y" 2
start_app
wait_home 4
home
screenshot "after-app-launch-clears-undo"

echo "== App-side mutation redraws the widget =="
debug_broadcast "$RESET_SEED_ACTION"
sleep 2
debug_broadcast "$COMPLETE_FIRST_PENDING_ACTION"
sleep 2
screenshot "after-app-side-complete"
debug_broadcast "$UNDO_FIRST_COMPLETED_ACTION"
sleep 2
screenshot "after-app-side-undo"

echo "== Multi-run footer context check =="
debug_broadcast "$RESET_MANY_RUNS_ACTION"
sleep 2
restart_app_fresh 4
wait_for_text "朝の支度" 20 1 || true
screenshot "app-list-many-runs"
tap_text "朝の支度" 2 || true
wait_for_text "新しい項目" 10 1
tap_text "⋯" 2 || true
wait_for_text "このCueはホーム画面に出ます。" 10 1
screenshot "app-run-detail-cue-settings"
home
show_widget_page || true
wait_for_text "水筒に水を入れる" 20 1 || true
screenshot "multi-run-footer-context"
echo "== Widget navigation preserves footer filtering and opens local Run without login =="
tap_text "朝の支度" 2
wait_for_text "↗" 10 1
screenshot "navigation-filtered-run"
run_screen_profile "filtered-narrow" "900x2424" "440"
run_screen_profile "filtered-short" "1080x1800" "420"
reset_screen_profile
home
show_widget_page
# Return the list to its first item after the profile scroll checks.
adb_shell input swipe 300 250 300 500 450
sleep 2
debug_broadcast "$SET_APPEARANCE_ACTION" --es widget_theme Dark --es widget_text_scale Large
sleep 2
screenshot "navigation-filtered-dark-large"
debug_broadcast "$SET_APPEARANCE_ACTION" --es widget_theme FollowApp --es widget_text_scale Standard
sleep 2
tap_text "↗" 2
wait_for_text "新しい項目" 10 1
wait_for_text "朝の支度" 10 1
screenshot "navigation-open-run"
home
show_widget_page
wait_for_text "↗" 10 1
# Tap below the footer text, inside the widget rather than the launcher's outer padding.
adb_shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1
nav_footer_bounds="$("$ADB" exec-out cat /sdcard/window.xml | tr '>' '\n' | grep -F 'text="朝の支度"' | tail -n 1 | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p')"
read -r nav_left nav_top nav_right nav_bottom <<<"$nav_footer_bounds"
tap "$(((nav_left + nav_right) / 2))" "$((nav_bottom + 12))" 2
wait_for_text "新しいリスト" 10 1
screenshot "navigation-background-top"
home
show_widget_page
# Use the footer occurrence, since the header also contains the Run title.
adb_shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1
nav_footer_bounds="$("$ADB" exec-out cat /sdcard/window.xml | tr '>' '\n' | grep -F 'text="朝の支度"' | tail -n 1 | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p')"
read -r nav_left nav_top nav_right nav_bottom <<<"$nav_footer_bounds"
tap "$(((nav_left + nav_right) / 2))" "$(((nav_top + nav_bottom) / 2))" 2
wait_for_text "戸締まりと火元を確認する" 10 1
screenshot "navigation-filter-cleared"
tap "$FOOTER_NEXT_X" "$FOOTER_NEXT_Y" 2
screenshot "multi-run-footer-context-after-next"

echo "== Vertical scroll smoke check =="
swipe_widget
screenshot "after-vertical-scroll"

echo "== Widget theme and text scale smoke checks =="
for theme in Light Dark FollowApp; do
  debug_broadcast "$SET_APPEARANCE_ACTION" --es widget_theme "$theme"
  sleep 2
  screenshot "appearance-widget-theme-$theme"
done

for scale in Compact Standard Large; do
  debug_broadcast "$SET_APPEARANCE_ACTION" --es widget_text_scale "$scale"
  sleep 2
  screenshot "appearance-widget-text-$scale"
done

debug_broadcast "$SET_APPEARANCE_ACTION" --es app_theme System --es widget_theme FollowApp --es widget_text_scale Standard
sleep 2

echo "== Screen profile smoke checks =="
reset_screen_profile
run_screen_profile "narrow" "900x2424" "440"
run_screen_profile "wide" "1440x2424" "440"
run_screen_profile "short" "1080x1800" "420"
run_screen_profile "tall" "1080x2800" "440"
reset_screen_profile

run_launcher_resize_smoke

start_app
wait_home 3
home
screenshot "final-reset-profile"

if [ "${RUN_REBOOT:-0}" = "1" ]; then
  echo "== Optional reboot recovery check =="
  debug_broadcast "$RESET_SEED_ACTION"
  sleep 2
  "$ADB" reboot
  "$ADB" wait-for-device
  sleep 20
  adb_shell input keyevent KEYCODE_WAKEUP || true
  adb_shell input keyevent KEYCODE_MENU || true
  start_app
  wait_home 5
  home
  screenshot "after-reboot-recovery"
fi

echo "== Done =="
echo "Artifacts: $OUT_DIR"
