#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ID = 'tuturuuu-mobile';
const ROOT_DIR = path.resolve(__dirname, '..');

const FIREBASE_APPS = {
  development: {
    android: {
      appId: '1:21140998358:android:c20877467f81f34f0de177',
      packageName: 'com.tuturuuu.app.mobile.dev',
    },
    ios: {
      appId: '1:21140998358:ios:74917dcd16ea89060de177',
      bundleId: 'com.tuturuuu.app.mobile.dev',
    },
  },
  production: {
    android: {
      appId: '1:21140998358:android:acb63cb6b5e3e6ec0de177',
      packageName: 'com.tuturuuu.app.mobile',
    },
    ios: {
      appId: '1:21140998358:ios:b943cf725f57d5500de177',
      bundleId: 'com.tuturuuu.app.mobile',
    },
  },
  staging: {
    android: {
      appId: '1:21140998358:android:0409412ce9e8ba8c0de177',
      packageName: 'com.tuturuuu.app.mobile.stg',
    },
    ios: {
      appId: '1:21140998358:ios:389d04f8f02849660de177',
      bundleId: 'com.tuturuuu.app.mobile.stg',
    },
  },
};

function parseArgs(argv) {
  const options = {
    environment: 'production',
    force: false,
    platform: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--force') {
      options.force = true;
      continue;
    }

    if (argument === '--environment' || argument === '--platform') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!FIREBASE_APPS[options.environment]) {
    throw new Error(
      `Unsupported environment: ${options.environment}. Use development, staging, or production.`
    );
  }

  if (
    options.platform &&
    options.platform !== 'android' &&
    options.platform !== 'ios'
  ) {
    throw new Error(
      `Unsupported platform: ${options.platform}. Use android or ios.`
    );
  }

  return options;
}

function extractPlistString(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(
    new RegExp(
      `<key>\\s*${escapedKey}\\s*</key>\\s*<string>\\s*([^<]+?)\\s*</string>`,
      'u'
    )
  );
  return match?.[1]?.trim();
}

function validateAndroidConfig(content, expected) {
  let config;
  try {
    config = JSON.parse(content);
  } catch {
    throw new Error('Firebase Android SDK config is not valid JSON');
  }

  const client = config.client?.find(
    (entry) =>
      entry.client_info?.android_client_info?.package_name ===
      expected.packageName
  );
  if (!client) {
    throw new Error(
      `Firebase Android SDK config does not contain ${expected.packageName}`
    );
  }

  if (client.client_info?.mobilesdk_app_id !== expected.appId) {
    throw new Error(
      `Firebase Android SDK config has the wrong app ID for ${expected.packageName}`
    );
  }
}

function validateIosConfig(content, expected) {
  if (!content.includes('<plist')) {
    throw new Error('Firebase iOS SDK config is not a property list');
  }

  if (extractPlistString(content, 'BUNDLE_ID') !== expected.bundleId) {
    throw new Error(
      `Firebase iOS SDK config has the wrong bundle ID for ${expected.bundleId}`
    );
  }

  if (extractPlistString(content, 'GOOGLE_APP_ID') !== expected.appId) {
    throw new Error(
      `Firebase iOS SDK config has the wrong app ID for ${expected.bundleId}`
    );
  }
}

function validateConfig(platform, content, expected) {
  if (platform === 'android') {
    validateAndroidConfig(content, expected);
    return;
  }
  validateIosConfig(content, expected);
}

function fetchSdkConfig({ appId, platform, projectId = PROJECT_ID }) {
  const result = spawnSync(
    'npx',
    [
      '-y',
      'firebase-tools@latest',
      'apps:sdkconfig',
      platform.toUpperCase(),
      appId,
      '--project',
      projectId,
    ],
    {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Unable to fetch the ${platform} Firebase SDK config. Run npx -y firebase-tools@latest login and confirm access to ${projectId}.`
    );
  }

  const output = result.stdout.trim();
  if (!output) {
    throw new Error(`Firebase CLI returned an empty ${platform} SDK config`);
  }
  return output.endsWith('\n') ? output : `${output}\n`;
}

function configPaths({ environment, platform, rootDir = ROOT_DIR }) {
  const mobileRoot = path.join(rootDir, 'apps', 'mobile');
  if (platform === 'android') {
    return [
      path.join(
        mobileRoot,
        'android',
        'app',
        'src',
        environment,
        'google-services.json'
      ),
    ];
  }

  const flavorPath = path.join(
    mobileRoot,
    'ios',
    'Runner',
    `GoogleService-Info-${environment}.plist`
  );
  if (environment === 'production') {
    return [
      flavorPath,
      path.join(mobileRoot, 'ios', 'Runner', 'GoogleService-Info.plist'),
    ];
  }
  return [flavorPath];
}

function writeSecureFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function ensureFlutterFireMetadata({ rootDir = ROOT_DIR } = {}) {
  const metadataPath = path.join(rootDir, 'apps', 'mobile', 'firebase.json');
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch {
      // Replace invalid ignored metadata with a deterministic configuration.
    }
  }

  const buildConfigurations = {};
  for (const [environment, platforms] of Object.entries(FIREBASE_APPS)) {
    const config = {
      appId: platforms.ios.appId,
      fileOutput: `ios/Runner/GoogleService-Info-${environment}.plist`,
      projectId: PROJECT_ID,
      uploadDebugSymbols: true,
    };
    for (const mode of ['Debug', 'Profile', 'Release']) {
      buildConfigurations[`${mode}-${environment}`] = config;
    }
  }

  metadata.flutter ??= {};
  metadata.flutter.platforms ??= {};
  metadata.flutter.platforms.ios = {
    ...metadata.flutter.platforms.ios,
    buildConfigurations,
  };
  writeSecureFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadataPath;
}

function ensureFirebaseConfig({
  environment,
  fetchConfig = fetchSdkConfig,
  force = false,
  platform,
  rootDir = ROOT_DIR,
}) {
  const expected = FIREBASE_APPS[environment][platform];
  const paths = configPaths({ environment, platform, rootDir });

  if (!force && fs.existsSync(paths[0])) {
    const primaryContent = fs.readFileSync(paths[0], 'utf8');
    try {
      validateConfig(platform, primaryContent, expected);

      let refreshed = false;
      for (const mirrorPath of paths.slice(1)) {
        const mirrorIsValid = (() => {
          if (!fs.existsSync(mirrorPath)) return false;
          try {
            validateConfig(
              platform,
              fs.readFileSync(mirrorPath, 'utf8'),
              expected
            );
            return true;
          } catch {
            return false;
          }
        })();

        if (!mirrorIsValid) {
          writeSecureFile(mirrorPath, primaryContent);
          refreshed = true;
        }
      }

      return { paths, refreshed };
    } catch {
      // Refresh stale or mismatched ignored configuration files below.
    }
  }

  const content = fetchConfig({
    appId: expected.appId,
    environment,
    platform,
    projectId: PROJECT_ID,
  });
  validateConfig(platform, content, expected);
  for (const filePath of paths) {
    writeSecureFile(filePath, content);
  }

  return { paths, refreshed: true };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const platforms = options.platform ? [options.platform] : ['android', 'ios'];

  for (const platform of platforms) {
    const result = ensureFirebaseConfig({ ...options, platform });
    if (platform === 'ios') {
      ensureFlutterFireMetadata();
    }
    const action = result.refreshed ? 'Hydrated' : 'Verified';
    console.log(
      `${action} ${options.environment} Firebase config for ${platform}.`
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  FIREBASE_APPS,
  configPaths,
  ensureFirebaseConfig,
  ensureFlutterFireMetadata,
  extractPlistString,
  parseArgs,
  validateAndroidConfig,
  validateIosConfig,
};
