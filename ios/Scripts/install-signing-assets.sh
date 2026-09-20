#!/usr/bin/env bash
set -euo pipefail

KEYCHAIN_PATH="$RUNNER_TEMP/cuckoocue-signing.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
P12_PATH="$RUNNER_TEMP/cuckoocue-distribution.p12"

required_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name"
    exit 1
  fi
}

required_env APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64
required_env APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD
required_env CUCKOOCUE_APPSTORE_PROFILE_APP_BASE64
required_env CUCKOOCUE_APPSTORE_PROFILE_WIDGET_BASE64

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

printf '%s' "$APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64" | base64 -D > "$P12_PATH"
security import "$P12_PATH" \
  -P "$APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" \
  -A \
  -t cert \
  -f pkcs12 \
  -k "$KEYCHAIN_PATH"
security list-keychain -d user -s "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

mkdir -p "$PROFILE_DIR"

install_profile() {
  local secret_value="$1"
  local label="$2"
  local profile="$RUNNER_TEMP/cuckoocue-$label.mobileprovision"
  local plist="$RUNNER_TEMP/cuckoocue-$label.plist"
  local uuid

  printf '%s' "$secret_value" | base64 -D > "$profile"
  security cms -D -i "$profile" > "$plist"
  uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$plist")"
  cp "$profile" "$PROFILE_DIR/$uuid.mobileprovision"
  echo "Installed provisioning profile $uuid"
}

install_profile "$CUCKOOCUE_APPSTORE_PROFILE_APP_BASE64" app
install_profile "$CUCKOOCUE_APPSTORE_PROFILE_WIDGET_BASE64" widget

security find-identity -v -p codesigning "$KEYCHAIN_PATH"
