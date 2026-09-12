#!/usr/bin/env bash
set +e
set -o pipefail

workspace="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
out_dir="$workspace/build/android-widget-screenshots"
mkdir -p "$out_dir"

ADB="${ANDROID_HOME:-/home/hiroyoshii/Android/Sdk}/platform-tools/adb" \
OUT_DIR="$out_dir" \
RUN_LAUNCHER_RESIZE="${RUN_LAUNCHER_RESIZE:-0}" \
RUN_INSTRUMENTATION="${RUN_INSTRUMENTATION:-0}" \
"$workspace/android/scripts/verify-widget-phase0.sh" \
  2>&1 | tee "$out_dir/verification.log"
status=$?

if [ "$status" -ne 0 ]; then
  message="$(tail -80 "$out_dir/verification.log" || true)"
  if [ -z "$message" ]; then
    message="No Android widget verification output was captured."
  fi
  message="${message//'%'/'%25'}"
  message="${message//$'\r'/'%0D'}"
  message="${message//$'\n'/'%0A'}"
  echo "::error title=Android widget verification failed::$message"
  exit "$status"
fi
