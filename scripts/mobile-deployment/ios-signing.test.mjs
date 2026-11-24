import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const scriptsDir = resolve('scripts/mobile-deployment');
const signingScript = join(scriptsDir, 'ios-signing.sh');
const buildScript = join(scriptsDir, 'ios-build-ipa.sh');
const team = 'TESTTEAM01';
const bundle = 'com.tuturuuu.app.mobile';
const profileUuid = '12345678-1234-1234-1234-123456789012';
const keySecret = 'FAKE-P8-CONTENTS-NEVER-LOGGED';

// Records every stubbed tool call as one line of NUL-free, \x1f-joined args.
const recorder = (name) => `#!/usr/bin/env bash
printf '%s' "${name}" >> "$STUB_LOG"
for arg in "$@"; do printf '\\x1f%s' "$arg" >> "$STUB_LOG"; done
printf '\\n' >> "$STUB_LOG"
`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ios-signing-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'apps', 'mobile');
  const bin = join(root, 'bin');
  const temp = join(root, 'runner-temp');
  for (const dir of [
    join(app, 'ios', 'Flutter'),
    join(app, 'ios', 'Runner'),
    bin,
    join(temp, 'mobile-deployment', 'private_keys'),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(
    join(app, 'ios', 'Runner', 'Runner-Production.entitlements'),
    ''
  );
  const stubs = {
    security: `${recorder('security')}
if [ "$1" = cms ]; then echo '<plist/>'; fi
`,
    openssl: `#!/usr/bin/env bash
echo 00ff00ff`,
    swift: `${recorder('swift')}
echo 'Verified App Store provisioning profile and required entitlements.'`,
    plistbuddy: `${recorder('plistbuddy')}
case "$2" in
  'Print Entitlements:com.apple.developer.usernotifications.time-sensitive')
    if [ "$STUB_TIME_SENSITIVE" = true ]; then echo true; else
      echo 'Print: Entry, "Entitlements:...", Does Not Exist'; exit 1; fi ;;
  'Print UUID') echo ${profileUuid} ;;
  'Print TeamIdentifier:0') echo ${team} ;;
  'Print Entitlements:application-identifier') echo ${team}.${bundle} ;;
esac
`,
    flutter: recorder('flutter'),
    xcodebuild: recorder('xcodebuild'),
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const keyPath = join(
    temp,
    'mobile-deployment',
    'private_keys',
    'AuthKey_X.p8'
  );
  writeFileSync(keyPath, keySecret, { mode: 0o600 });
  const files = {
    env: join(root, 'github-env'),
    summary: join(root, 'step-summary'),
    log: join(root, 'stub-log'),
  };
  for (const file of Object.values(files)) writeFileSync(file, '');
  const run = (script, args, extra = {}) => {
    const result = spawnSync('bash', [script, ...args], {
      cwd: app,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: root,
        RUNNER_TEMP: temp,
        GITHUB_ENV: files.env,
        GITHUB_STEP_SUMMARY: files.summary,
        STUB_LOG: files.log,
        PLIST_BUDDY: join(bin, 'plistbuddy'),
        APPLE_TEAM_ID: team,
        APPLE_BUNDLE_ID: bundle,
        APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH: join(temp, 'dist.p12'),
        APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD: 'p12-password',
        APPLE_PROVISIONING_PROFILE_PATH: join(temp, 'app.mobileprovision'),
        APP_STORE_CONNECT_API_KEY_ID: 'ABCDEFGHIJ',
        APP_STORE_CONNECT_ISSUER_ID: 'issuer-id',
        APP_STORE_CONNECT_PRIVATE_KEY_PATH: keyPath,
        ...extra,
      },
    });
    const calls = readFileSync(files.log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\x1f'));
    return { ...result, calls };
  };
  writeFileSync(join(temp, 'app.mobileprovision'), 'profile');
  const read = (path) => readFileSync(join(app, path), 'utf8');
  return { app, files, keyPath, read, run };
}

test('manual signing omits Time Sensitive Notifications when the profile lacks it', (t) => {
  const { files, read, run } = fixture(t);
  const result = run(signingScript, ['manual']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /::warning title=Time Sensitive Notifications omitted::/
  );
  assert.ok(
    result.calls.some(
      (call) =>
        call[0] === 'plistbuddy' &&
        call[2] ===
          'Delete :com.apple.developer.usernotifications.time-sensitive' &&
        call[3] === 'ios/Runner/Runner-Production.entitlements'
    )
  );
  const env = readFileSync(files.env, 'utf8');
  assert.match(env, /^MOBILE_TIME_SENSITIVE_ENTITLEMENT=false$/m);
  assert.match(env, new RegExp(`^MOBILE_PROFILE_UUID=${profileUuid}$`, 'm'));
  assert.match(
    readFileSync(files.summary, 'utf8'),
    /Time Sensitive Notifications omitted/
  );
  assert.match(
    read('ios/Flutter/StoreSigning.xcconfig'),
    /CODE_SIGN_STYLE = Manual/
  );
  const options = read('ios/ExportOptions.plist');
  assert.match(options, /<string>manual<\/string>/);
  assert.match(options, new RegExp(`<string>${profileUuid}</string>`));
  assert.match(
    options,
    /<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/
  );
  assert.doesNotMatch(result.stdout + result.stderr, /p12-password/);
});

test('manual signing keeps Time Sensitive Notifications the profile grants', (t) => {
  const { files, run } = fixture(t);
  const result = run(signingScript, ['manual'], {
    STUB_TIME_SENSITIVE: 'true',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Time Sensitive Notifications omitted/);
  assert.ok(!result.calls.some((call) => call[2]?.startsWith('Delete')));
  assert.match(
    readFileSync(files.env, 'utf8'),
    /^MOBILE_TIME_SENSITIVE_ENTITLEMENT=true$/m
  );
});

test('cloud signing hands signing to Xcode without the vault identity', (t) => {
  const { files, read, run } = fixture(t);
  const result = run(signingScript, ['cloud']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.calls.filter((call) => call[0] === 'security'),
    [],
    'cloud signing must not import a certificate or profile'
  );
  const xcconfig = read('ios/Flutter/StoreSigning.xcconfig');
  assert.match(xcconfig, /CODE_SIGN_STYLE = Automatic/);
  assert.match(xcconfig, new RegExp(`DEVELOPMENT_TEAM = ${team}`));
  assert.doesNotMatch(xcconfig, /CODE_SIGN_IDENTITY|PROVISIONING_PROFILE/);
  const options = read('ios/ExportOptions.plist');
  assert.match(
    options,
    /<key>signingStyle<\/key>\s*<string>automatic<\/string>/
  );
  assert.match(options, /<string>app-store-connect<\/string>/);
  assert.doesNotMatch(options, /provisioningProfiles/);
  assert.match(
    readFileSync(files.env, 'utf8'),
    /^MOBILE_TIME_SENSITIVE_ENTITLEMENT=true$/m
  );
});

test('cloud signing refuses a missing App Store Connect key and unknown modes', (t) => {
  const { app, run } = fixture(t);
  const missing = run(signingScript, ['cloud'], {
    APP_STORE_CONNECT_PRIVATE_KEY_PATH: join(app, 'missing.p8'),
  });
  assert.notEqual(missing.status, 0);
  assert.ok(!existsSync(join(app, 'ios', 'ExportOptions.plist')));
  const unknown = run(signingScript, ['xcode-cloud']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown iOS signing mode/);
});

test('cloud builds archive and export with App Store Connect authentication', (t) => {
  const { keyPath, run } = fixture(t);
  const result = run(buildScript, ['cloud', '0.27.40', '1000013']);
  assert.equal(result.status, 0, result.stderr);
  const [flutter, archive, exported] = result.calls;
  assert.equal(flutter[0], 'flutter');
  assert.deepEqual(flutter.slice(1, 3), ['build', 'ios']);
  assert.ok(flutter.includes('--config-only'));
  assert.ok(flutter.includes('--build-number=1000013'));
  assert.ok(flutter.includes('--build-name=0.27.40'));
  assert.ok(
    flutter.includes('--dart-define=IOS_LIVE_SCREEN_BROADCAST_ENABLED=false')
  );
  for (const call of [archive, exported]) {
    assert.equal(call[0], 'xcodebuild');
    assert.ok(call.includes('-allowProvisioningUpdates'));
    assert.equal(call[call.indexOf('-authenticationKeyPath') + 1], keyPath);
    assert.equal(call[call.indexOf('-authenticationKeyID') + 1], 'ABCDEFGHIJ');
    assert.equal(
      call[call.indexOf('-authenticationKeyIssuerID') + 1],
      'issuer-id'
    );
  }
  assert.equal(archive.at(-1), 'archive');
  assert.equal(archive[archive.indexOf('-scheme') + 1], 'production');
  assert.equal(
    archive[archive.indexOf('-configuration') + 1],
    'Release-production'
  );
  assert.ok(exported.includes('-exportArchive'));
  assert.equal(
    exported[exported.indexOf('-archivePath') + 1],
    'build/ios/archive/Runner.xcarchive'
  );
  assert.equal(exported[exported.indexOf('-exportPath') + 1], 'build/ios/ipa');
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(keySecret));
});

test('manual builds keep the Flutter IPA export', (t) => {
  const { run } = fixture(t);
  const result = run(buildScript, ['manual', '0.27.40', '1000013']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  const [flutter] = result.calls;
  assert.deepEqual(flutter.slice(1, 3), ['build', 'ipa']);
  assert.ok(flutter.includes('--export-options-plist=ios/ExportOptions.plist'));
  assert.ok(!flutter.includes('--config-only'));
});
