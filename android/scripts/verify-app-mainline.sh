#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADB="${ADB:-/home/hiroyoshii/Android/Sdk/platform-tools/adb}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/build/app-verification}"
PACKAGE="app.cuckoocue"
MAIN_ACTIVITY="$PACKAGE/.MainActivity"
RESET_SEED_ACTION="$PACKAGE.debug.RESET_SEED"

RUN_CARD_TEXT="${RUN_CARD_TEXT:-手元に置くこと}"
RUN_CARD_X="${RUN_CARD_X:-520}"
RUN_CARD_Y="${RUN_CARD_Y:-540}"
FIRST_ROW_X="${FIRST_ROW_X:-430}"
FIRST_ROW_Y="${FIRST_ROW_Y:-430}"
FIRST_ROW_TITLE_X="${FIRST_ROW_TITLE_X:-320}"
FIRST_ROW_TITLE_Y="${FIRST_ROW_TITLE_Y:-430}"
NEXT_ROW_TITLE_X="${NEXT_ROW_TITLE_X:-360}"
NEXT_ROW_TITLE_Y="${NEXT_ROW_TITLE_Y:-520}"

mkdir -p "$OUT_DIR"

adb_shell() {
  "$ADB" shell "$@"
}

screenshot() {
  local name="$1"
  "$ADB" exec-out screencap -p > "$OUT_DIR/$name.png"
  echo "screenshot: $OUT_DIR/$name.png"
}

type_next_item() {
  adb_shell input tap "$NEXT_ROW_TITLE_X" "$NEXT_ROW_TITLE_Y"
  sleep 1
  adb_shell input text nextitem
  sleep 1
}

open_run_detail() {
  sleep 5
  adb_shell input tap "$RUN_CARD_X" "$RUN_CARD_Y"
  sleep 3
}

cd "$ROOT_DIR"
./gradlew installDebug >/dev/null

adb_shell settings put secure stylus_handwriting_enabled 0 >/dev/null 2>&1 || true
adb_shell settings put secure stylus_handwriting_default_value 0 >/dev/null 2>&1 || true
adb_shell am broadcast -a "$RESET_SEED_ACTION" -n "$PACKAGE/.debug.VerificationReceiver" >/dev/null
adb_shell am force-stop "$PACKAGE"
adb_shell am start -n "$MAIN_ACTIVITY" >/dev/null

open_run_detail
screenshot "01-list-detail-no-add-button"

adb_shell input tap "$FIRST_ROW_X" "$FIRST_ROW_Y"
sleep 1
adb_shell input tap "$FIRST_ROW_TITLE_X" "$FIRST_ROW_TITLE_Y"
sleep 1
screenshot "02-inline-controls-open"

adb_shell input keyevent KEYCODE_ENTER
sleep 1
screenshot "03-enter-creates-persisted-blank-row"

type_next_item
adb_shell input keyevent KEYCODE_ENTER
sleep 1
screenshot "04-enter-saves-and-continues"

echo "Screenshots are in $OUT_DIR"
