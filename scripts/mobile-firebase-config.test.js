const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  FIREBASE_APPS,
  configPaths,
  ensureFirebaseConfig,
  ensureFlutterFireMetadata,
  parseArgs,
  validateAndroidConfig,
  validateIosConfig,
} = require('./mobile-firebase-config.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-firebase-config-'));
}

function androidConfig(environment) {
  const expected = FIREBASE_APPS[environment].android;
  return `${JSON.stringify({
    project_info: { project_id: 'tuturuuu-mobile' },
    client: [
      {
        client_info: {
          mobilesdk_app_id: expected.appId,
          android_client_info: { package_name: expected.packageName },
        },
      },
    ],
  })}\n`;
}

function iosConfig(environment) {
  const expected = FIREBASE_APPS[environment].ios;
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>BUNDLE_ID</key>
  <string>${expected.bundleId}</string>
  <key>GOOGLE_APP_ID</key>
  <string>${expected.appId}</string>
</dict>
</plist>
`;
}

test('parseArgs validates supported platforms and environments', () => {
  assert.deepEqual(parseArgs([]), {
    environment: 'production',
    force: false,
    platform: undefined,
  });
  assert.deepEqual(
    parseArgs(['--environment', 'development', '--platform', 'android']),
    {
      environment: 'development',
      force: false,
      platform: 'android',
    }
  );
  assert.throws(
    () => parseArgs(['--environment', 'preview']),
    /Unsupported environment/u
  );
  assert.throws(
    () => parseArgs(['--platform', 'web']),
    /Unsupported platform/u
  );
});

test('Firebase config validators reject mismatched native apps', () => {
  validateAndroidConfig(
    androidConfig('production'),
    FIREBASE_APPS.production.android
  );
  validateIosConfig(iosConfig('production'), FIREBASE_APPS.production.ios);

  assert.throws(
    () =>
      validateAndroidConfig(
        androidConfig('development'),
        FIREBASE_APPS.production.android
      ),
    /does not contain/u
  );
  assert.throws(
    () =>
      validateIosConfig(iosConfig('development'), FIREBASE_APPS.production.ios),
    /wrong bundle ID/u
  );
});

test('ensureFirebaseConfig hydrates ignored Android flavor config securely', (t) => {
  const rootDir = makeTempRoot();
  t.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));

  let fetchCount = 0;
  const first = ensureFirebaseConfig({
    environment: 'production',
    fetchConfig: () => {
      fetchCount += 1;
      return androidConfig('production');
    },
    platform: 'android',
    rootDir,
  });

  assert.equal(first.refreshed, true);
  assert.equal(fetchCount, 1);
  assert.equal(first.paths.length, 1);
  assert.equal(fs.statSync(first.paths[0]).mode & 0o777, 0o600);

  const second = ensureFirebaseConfig({
    environment: 'production',
    fetchConfig: () => {
      fetchCount += 1;
      return androidConfig('production');
    },
    platform: 'android',
    rootDir,
  });
  assert.equal(second.refreshed, false);
  assert.equal(fetchCount, 1);
});

test('production iOS hydration preserves flavor config and creates its mirror', (t) => {
  const rootDir = makeTempRoot();
  t.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));

  const expectedPaths = configPaths({
    environment: 'production',
    platform: 'ios',
    rootDir,
  });
  fs.mkdirSync(path.dirname(expectedPaths[0]), { recursive: true });
  fs.writeFileSync(expectedPaths[0], iosConfig('production'), { mode: 0o600 });

  const result = ensureFirebaseConfig({
    environment: 'production',
    fetchConfig: () => {
      throw new Error('valid flavor config should not be fetched again');
    },
    platform: 'ios',
    rootDir,
  });

  assert.deepEqual(result.paths, expectedPaths);
  assert.equal(result.refreshed, true);
  assert.equal(result.paths.length, 2);
  assert.equal(
    fs.readFileSync(result.paths[0], 'utf8'),
    fs.readFileSync(result.paths[1], 'utf8')
  );
  assert.equal(fs.statSync(result.paths[1]).mode & 0o777, 0o600);
});

test('FlutterFire metadata covers every iOS flavor without dropping other platforms', (t) => {
  const rootDir = makeTempRoot();
  t.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));

  const metadataPath = path.join(rootDir, 'apps', 'mobile', 'firebase.json');
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(
    metadataPath,
    JSON.stringify({ flutter: { platforms: { android: { preserved: true } } } })
  );

  ensureFlutterFireMetadata({ rootDir });
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const configurations = metadata.flutter.platforms.ios.buildConfigurations;

  assert.equal(metadata.flutter.platforms.android.preserved, true);
  assert.equal(Object.keys(configurations).length, 9);
  assert.equal(
    configurations['Release-production'].appId,
    FIREBASE_APPS.production.ios.appId
  );
  assert.equal(configurations['Debug-staging'].uploadDebugSymbols, true);
  assert.equal(fs.statSync(metadataPath).mode & 0o777, 0o600);
});
