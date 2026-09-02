#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-/home/hiroyoshii/Android/Sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
PACKAGE="app.cuckoocue"
RESET_SEED_ACTION="$PACKAGE.benchmark.RESET_SEED"
COUNT_DATA_ACTION="$PACKAGE.benchmark.COUNT_DATA"
SEED_RECEIVER="$PACKAGE/.benchmark.BenchmarkSeedReceiver"
BENCHMARK_RUN_COUNT="${BENCHMARK_RUN_COUNT:-500}"
BENCHMARK_TASKS_PER_RUN="${BENCHMARK_TASKS_PER_RUN:-5}"

"$ANDROID_HOME/platform-tools/adb" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
"$ANDROID_HOME/platform-tools/adb" uninstall "$PACKAGE" >/dev/null 2>&1 || true
"$ANDROID_HOME/platform-tools/adb" uninstall "$PACKAGE.macrobenchmark" >/dev/null 2>&1 || true

./gradlew :app:installBenchmark

"$ANDROID_HOME/platform-tools/adb" shell am broadcast \
  -a "$RESET_SEED_ACTION" \
  -n "$SEED_RECEIVER" \
  --ei run_count "$BENCHMARK_RUN_COUNT" \
  --ei tasks_per_run "$BENCHMARK_TASKS_PER_RUN" >/dev/null
"$ANDROID_HOME/platform-tools/adb" shell am broadcast \
  -a "$COUNT_DATA_ACTION" \
  -n "$SEED_RECEIVER"

if [ "$#" -gt 0 ]; then
  ./gradlew :macrobenchmark:connectedBenchmarkAndroidTest \
    -Pandroid.testInstrumentationRunnerArguments.class="$1"
else
  ./gradlew :macrobenchmark:connectedBenchmarkAndroidTest
fi
