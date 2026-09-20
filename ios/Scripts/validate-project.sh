#!/usr/bin/env bash
set -euo pipefail

project="ios/project.yml"
app_entitlements="ios/CuckooCue/CuckooCue.entitlements"
widget_entitlements="ios/CuckooCueWidget/CuckooCueWidget.entitlements"
aasa="web/public/.well-known/apple-app-site-association"
export_options="ios/CuckooCueExportOptions.plist"

grep -q 'DEVELOPMENT_TEAM: 3M4M7DRUZY' "$project"
grep -q 'PRODUCT_BUNDLE_IDENTIFIER: app.cuckoocue.ios$' "$project"
grep -q 'PRODUCT_BUNDLE_IDENTIFIER: app.cuckoocue.ios.widget$' "$project"
grep -q 'PROVISIONING_PROFILE_SPECIFIER: Cuckoo Cue' "$project"
grep -q 'PROVISIONING_PROFILE_SPECIFIER: Cuckoo Cue Widget' "$project"
grep -q 'applinks:cuckoocue.hiyozoo.com' "$project"

plutil -lint "$app_entitlements" >/dev/null
plutil -lint "$widget_entitlements" >/dev/null
plutil -lint "$export_options" >/dev/null
grep -q 'group.app.cuckoocue.shared' "$app_entitlements"
grep -q 'group.app.cuckoocue.shared' "$widget_entitlements"

python3 - "$aasa" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    association = json.load(handle)

details = association["applinks"]["details"]
assert details == [{
    "appIDs": ["3M4M7DRUZY.app.cuckoocue.ios"],
    "components": [{
        "/": "/import",
        "comment": "Open an existing Cuckoo Cue run in the iOS app.",
    }],
}]
PY

echo "iOS project static validation passed."
