#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p artifacts

if [[ ! -d "$PROFILE_DIR" ]]; then
  echo "Provisioning profile directory does not exist: $PROFILE_DIR"
  exit 1
fi

expected_profiles=(
  "Cuckoo Cue|3M4M7DRUZY.app.cuckoocue.ios|app"
  "Cuckoo Cue Widget|3M4M7DRUZY.app.cuckoocue.ios.widget|widget"
)

for expected in "${expected_profiles[@]}"; do
  IFS='|' read -r expected_name expected_app_id expected_kind <<< "$expected"
  found="false"

  for profile in "$PROFILE_DIR"/*.mobileprovision; do
    [[ -e "$profile" ]] || continue
    plist="$RUNNER_TEMP/inspect-$(basename "$profile").plist"
    security cms -D -i "$profile" > "$plist"

    name="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$plist" 2>/dev/null || true)"
    uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$plist" 2>/dev/null || true)"
    app_id="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$plist" 2>/dev/null || true)"
    [[ "$name" == "$expected_name" && "$app_id" == "$expected_app_id" ]] || continue

    found="true"
    {
      echo "Profile: $name"
      echo "UUID: $uuid"
      echo "Application Identifier: $app_id"
      echo "---"
    } | tee -a artifacts/provisioning-profile-summary.log

    /usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.security.application-groups' "$plist" \
      | grep -q 'group.app.cuckoocue.shared'
    if [[ "$expected_kind" == "app" ]]; then
      # Distribution profiles authorize Associated Domains with a wildcard;
      # the concrete applinks domain is declared in the app entitlements.
      /usr/libexec/PlistBuddy \
        -c 'Print :Entitlements:com.apple.developer.associated-domains' \
        "$plist" >/dev/null
    fi
  done

  if [[ "$found" != "true" ]]; then
    echo "Expected provisioning profile not found: $expected_name ($expected_app_id)"
    exit 1
  fi
done

echo "Provisioning profile entitlement validation passed."
