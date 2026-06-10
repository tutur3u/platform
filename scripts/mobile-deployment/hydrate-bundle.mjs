#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const EXPECTED_ANDROID_PACKAGE = 'com.tuturuuu.app.mobile';
const EXPECTED_IOS_BUNDLE = 'com.tuturuuu.app.mobile';
const EXPECTED_PLAY_TRACK = 'internal';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      continue;
    }

    args[entry.slice(2)] = argv[index + 1];
    index += 1;
  }

  return args;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function addMask(value) {
  if (value) {
    process.stdout.write(`::add-mask::${String(value)}\n`);
  }
}

function exportEnv(name, value) {
  if (!process.env.GITHUB_ENV) {
    return;
  }

  appendFileSync(process.env.GITHUB_ENV, `${name}<<__MOBILE_DEPLOY__\n`);
  appendFileSync(process.env.GITHUB_ENV, `${value ?? ''}\n`);
  appendFileSync(process.env.GITHUB_ENV, '__MOBILE_DEPLOY__\n');
}

async function writeSecureFile(path, buffer) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, buffer, { mode: 0o600 });
}

async function writeBundleFile(bundle, kind, path) {
  const file = bundle.files[kind];
  if (!file) {
    fail(`Missing bundle file: ${kind}`);
  }

  const buffer = Buffer.from(file.base64, 'base64');
  if (sha256Hex(buffer) !== file.sha256) {
    fail(`SHA-256 mismatch for ${kind}`);
  }

  await writeSecureFile(path, buffer);
  return path;
}

function maskScalars(bundle) {
  for (const value of Object.values(bundle.scalarValues ?? {})) {
    addMask(value);
  }

  for (const line of String(bundle.envFile ?? '').split(/\r?\n/u)) {
    const separator = line.indexOf('=');
    if (separator > 0) {
      addMask(line.slice(separator + 1));
    }
  }
}

function validateBundleIdentity(bundle, platform) {
  if (bundle.environment !== 'production') {
    fail('Bundle environment must be production');
  }

  if (bundle.platform !== platform) {
    fail(`Bundle platform must be ${platform}`);
  }

  if (platform === 'android') {
    if (
      bundle.scalarValues.GOOGLE_PLAY_PACKAGE_NAME !== EXPECTED_ANDROID_PACKAGE
    ) {
      fail(`GOOGLE_PLAY_PACKAGE_NAME must be ${EXPECTED_ANDROID_PACKAGE}`);
    }

    if (bundle.scalarValues.GOOGLE_PLAY_TRACK !== EXPECTED_PLAY_TRACK) {
      fail(`GOOGLE_PLAY_TRACK must be ${EXPECTED_PLAY_TRACK}`);
    }
  }

  if (
    platform === 'ios' &&
    bundle.scalarValues.APPLE_BUNDLE_ID !== EXPECTED_IOS_BUNDLE
  ) {
    fail(`APPLE_BUNDLE_ID must be ${EXPECTED_IOS_BUNDLE}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = args.platform;
  const bundlePath = args.bundle;
  const mobileRoot = resolve(args['mobile-root'] || process.cwd());
  const runnerTemp = resolve(
    process.env.RUNNER_TEMP || join(mobileRoot, '.tmp')
  );

  if (platform !== 'android' && platform !== 'ios') {
    fail('--platform must be android or ios');
  }

  if (!bundlePath) {
    fail('--bundle is required');
  }

  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  validateBundleIdentity(bundle, platform);
  maskScalars(bundle);

  await writeSecureFile(
    join(mobileRoot, '.env.github'),
    Buffer.from(bundle.envFile)
  );

  if (platform === 'android') {
    await writeBundleFile(
      bundle,
      'android_google_services_json',
      join(mobileRoot, 'android/app/src/production/google-services.json')
    );
    const keystorePath = await writeBundleFile(
      bundle,
      'android_upload_keystore',
      join(runnerTemp, 'mobile-deployment/android-upload-keystore.jks')
    );
    const playServiceAccountPath = await writeBundleFile(
      bundle,
      'google_play_service_account_json',
      join(runnerTemp, 'mobile-deployment/google-play-service-account.json')
    );

    exportEnv(
      'ANDROID_KEYSTORE_ALIAS',
      bundle.scalarValues.ANDROID_KEYSTORE_ALIAS
    );
    exportEnv(
      'ANDROID_KEYSTORE_PASSWORD',
      bundle.scalarValues.ANDROID_KEYSTORE_PASSWORD
    );
    exportEnv(
      'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD',
      bundle.scalarValues.ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD
    );
    exportEnv('ANDROID_KEYSTORE_PATH', keystorePath);
    exportEnv('GOOGLE_PLAY_PACKAGE_NAME', EXPECTED_ANDROID_PACKAGE);
    exportEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH', playServiceAccountPath);
    exportEnv('GOOGLE_PLAY_TRACK', EXPECTED_PLAY_TRACK);
    return;
  }

  await writeBundleFile(
    bundle,
    'ios_google_service_info_plist',
    join(mobileRoot, 'ios/Runner/GoogleService-Info-production.plist')
  );
  await writeBundleFile(
    bundle,
    'ios_google_service_info_plist',
    join(mobileRoot, 'ios/Runner/GoogleService-Info.plist')
  );
  const p12Path = await writeBundleFile(
    bundle,
    'apple_distribution_certificate_p12',
    join(runnerTemp, 'mobile-deployment/apple-distribution.p12')
  );
  const profilePath = await writeBundleFile(
    bundle,
    'apple_app_store_provisioning_profile',
    join(runnerTemp, 'mobile-deployment/app-store.mobileprovision')
  );
  const keyId = bundle.scalarValues.APP_STORE_CONNECT_API_KEY_ID;
  const p8Path = await writeBundleFile(
    bundle,
    'app_store_connect_private_key_p8',
    join(
      process.env.HOME || runnerTemp,
      `.appstoreconnect/private_keys/AuthKey_${keyId}.p8`
    )
  );

  exportEnv('APPLE_BUNDLE_ID', EXPECTED_IOS_BUNDLE);
  exportEnv(
    'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
    bundle.scalarValues.APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD
  );
  exportEnv('APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH', p12Path);
  exportEnv('APPLE_PROVISIONING_PROFILE_PATH', profilePath);
  exportEnv('APPLE_TEAM_ID', bundle.scalarValues.APPLE_TEAM_ID);
  exportEnv('APP_STORE_CONNECT_API_KEY_ID', keyId);
  exportEnv(
    'APP_STORE_CONNECT_ISSUER_ID',
    bundle.scalarValues.APP_STORE_CONNECT_ISSUER_ID
  );
  exportEnv('APP_STORE_CONNECT_PRIVATE_KEY_PATH', p8Path);
}

await main();
