#!/usr/bin/env bash
set -euo pipefail

KEYCHAIN_PATH="$RUNNER_TEMP/cuckoocue-signing.keychain-db"

if [[ -f "$KEYCHAIN_PATH" ]]; then
  security delete-keychain "$KEYCHAIN_PATH" || true
fi

rm -f "$RUNNER_TEMP"/cuckoocue-*.p12
rm -f "$RUNNER_TEMP"/cuckoocue-*.mobileprovision
rm -f "$RUNNER_TEMP"/cuckoocue-*.plist
rm -f "ios/CuckooCue/GoogleService-Info.plist"
