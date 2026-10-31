#!/usr/bin/env bash
# Build a production-connected debug APK without installing or resetting a device.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sdk="${ANDROID_HOME:-/home/hiroyoshii/Android/Sdk}"
out="$repo/output/mobile-device-acceptance"
mkdir -p "$out"
cd "$repo/android"
./gradlew :app:assembleDebug --console=plain
apk="$repo/android/app/build/outputs/apk/debug/app-debug.apk"
python3 - "$repo" "$sdk" "$apk" "$out" <<'PY'
import datetime, hashlib, json, pathlib, re, shutil, subprocess, sys, urllib.request
repo, sdk, apk, out = map(pathlib.Path, sys.argv[1:])
build_tools = sorted((sdk / 'build-tools').glob('*'), key=lambda p: [int(n) for n in re.findall(r'\d+', p.name)])[-1]
certs = subprocess.check_output([str(build_tools / 'apksigner'), 'verify', '--print-certs', str(apk)], text=True)
sha256 = re.search(r'certificate SHA-256 digest: (\w+)', certs)[1].upper()
fingerprint = ':'.join(sha256[i:i+2] for i in range(0, len(sha256), 2))
resources = subprocess.check_output([str(build_tools / 'aapt2'), 'dump', 'resources', str(apk)], text=True)
url = re.search(r'string/cuckoo_cue_web_url\b[^\n]*\n\s*\([^\n]*\) "([^"]+)"', resources)
if not url or url[1] != 'https://cuckoocue.hiyozoo.com':
    raise SystemExit('APK is not connected to the production Web. Remove journeyApiBaseUrl and rebuild.')
with urllib.request.urlopen('https://cuckoocue.hiyozoo.com/.well-known/assetlinks.json', timeout=30) as response:
    links = json.load(response)
matched = any(x.get('target', {}).get('package_name') == 'app.cuckoocue' and fingerprint in x['target'].get('sha256_cert_fingerprints', []) for x in links)
if not matched:
    raise SystemExit('APK certificate does not match production assetlinks. Use the configured debug signing key; do not force-approve App Links.')
target = out / 'cuckoocue-debug.apk'
shutil.copy2(apk, target)
version = json.loads((apk.parent / 'output-metadata.json').read_text())['elements'][0]
manifest = {
    'built_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'version_name': version['versionName'], 'version_code': version['versionCode'],
    'source_commit': subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip(),
    'android_source_tree': subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD:android/app/src'], text=True).strip(),
    'android_uncommitted_paths': subprocess.check_output(['git', '-C', str(repo), 'diff', '--name-only', 'HEAD', '--', 'android'], text=True).splitlines(),
    'apk': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'certificate_sha256': fingerprint, 'production_assetlinks_matches': matched,
    'api_base_url': url[1], 'variant': 'debug',
    'physical_device_acceptance': 'not_run',
}
(out / 'build.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
PY
