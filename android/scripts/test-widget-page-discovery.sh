#!/usr/bin/env bash
set -euo pipefail

# Exercise the launcher search state machine without an emulator or real sleeps.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OUT_DIR:-$script_dir/../build/widget-discovery-test}"
source <(sed '/^capture_verification_failure()/,$d' "$script_dir/verify-widget-phase0.sh")
sleep() { :; }
home() { page=0; home_count=$((home_count + 1)); }
adb_shell() {
  if [ "$1 $2" = 'wm size' ]; then
    echo 'Physical size: 1080x1800'
  elif [ "$1 $2" = 'input swipe' ]; then
    page=$((page + 1))
    if [ "$direction" = forward ]; then forward_swipes=$((forward_swipes + 1)); fi
  fi
}
fake_adb() {
  if [ "$scenario" = discover ] && [ "$direction" = forward ] && [ "$page" -ge 1 ]; then
    echo '<node package="com.google.android.googlequicksearchbox" />'
  elif [ "$scenario" = missing ]; then
    echo '<node package="com.google.android.googlequicksearchbox" />'
  else
    echo '<node package="com.google.android.apps.nexuslauncher" />'
  fi
}
ADB=fake_adb
ui_launcher_widget_bounds() {
  case "$scenario" in
    delayed) [ "$page" -eq 1 ] && [ "$attempt" -eq 3 ] || return 1 ;;
    discover) [ "$direction" = backward ] && [ "$page" -eq 1 ] || return 1 ;;
    missing) return 1 ;;
  esac
  echo '60 200 700 690'
}

scenario=delayed; page=0; home_count=0; forward_swipes=0
show_widget_page
[ "$forward_swipes" -eq 1 ]
echo 'PASS: wait for delayed host on the same page'

scenario=discover; page=0; home_count=0; forward_swipes=0
show_widget_page
[ "$forward_swipes" -eq 1 ]
[ "$home_count" -eq 3 ]
echo 'PASS: leave Discover and restart opposite search from Home'

scenario=missing; page=0; home_count=0; forward_swipes=0
if show_widget_page; then echo 'Unexpected success for missing widget' >&2; exit 1; fi
[ "$forward_swipes" -eq 0 ]
[ "$home_count" -eq 4 ]
echo 'PASS: missing widget fails and leaves launcher on Home'
