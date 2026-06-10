import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('hydrate-bundle writes Android files and exports fixed env paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mobile-deploy-hydrate-'));
  const mobileRoot = join(root, 'apps/mobile');
  const runnerTemp = join(root, 'runner-temp');
  await mkdir(join(mobileRoot, 'android/app/src/production'), {
    recursive: true,
  });
  await mkdir(runnerTemp, { recursive: true });

  const googleServices = Buffer.from(
    JSON.stringify({
      client: [
        {
          client_info: {
            android_client_info: {
              package_name: 'com.tuturuuu.app.mobile',
            },
          },
        },
      ],
    })
  );
  const keystore = Buffer.from('keystore');
  const playServiceAccount = Buffer.from(
    JSON.stringify({
      client_email: 'play@example.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
      type: 'service_account',
    })
  );
  const bundle = {
    environment: 'production',
    envFile: 'NEXT_PUBLIC_APP_URL=https://tuturuuu.com\n',
    files: {
      android_google_services_json: {
        base64: googleServices.toString('base64'),
        contentType: 'application/json',
        filename: 'google-services.json',
        kind: 'android_google_services_json',
        sha256: sha256Hex(googleServices),
        size: googleServices.byteLength,
      },
      android_upload_keystore: {
        base64: keystore.toString('base64'),
        contentType: 'application/octet-stream',
        filename: 'upload-keystore.jks',
        kind: 'android_upload_keystore',
        sha256: sha256Hex(keystore),
        size: keystore.byteLength,
      },
      google_play_service_account_json: {
        base64: playServiceAccount.toString('base64'),
        contentType: 'application/json',
        filename: 'google-play.json',
        kind: 'google_play_service_account_json',
        sha256: sha256Hex(playServiceAccount),
        size: playServiceAccount.byteLength,
      },
    },
    platform: 'android',
    scalarValues: {
      ANDROID_KEYSTORE_ALIAS: 'upload',
      ANDROID_KEYSTORE_PASSWORD: 'store-pass',
      ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD: 'key-pass',
      GOOGLE_PLAY_PACKAGE_NAME: 'com.tuturuuu.app.mobile',
      GOOGLE_PLAY_TRACK: 'internal',
    },
    versionId: 'version',
    versionNumber: 1,
  };
  const bundlePath = join(root, 'bundle.json');
  const githubEnv = join(root, 'github-env');
  writeFileSync(bundlePath, JSON.stringify(bundle));

  execFileSync(
    'node',
    [
      'scripts/mobile-deployment/hydrate-bundle.mjs',
      '--platform',
      'android',
      '--bundle',
      bundlePath,
      '--mobile-root',
      mobileRoot,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_ENV: githubEnv,
        RUNNER_TEMP: runnerTemp,
      },
      stdio: 'pipe',
    }
  );

  assert.equal(
    readFileSync(join(mobileRoot, '.env.github'), 'utf8'),
    bundle.envFile
  );
  assert.equal(
    readFileSync(
      join(mobileRoot, 'android/app/src/production/google-services.json'),
      'utf8'
    ),
    googleServices.toString()
  );
  assert.match(readFileSync(githubEnv, 'utf8'), /ANDROID_KEYSTORE_PATH/);
  assert.match(readFileSync(githubEnv, 'utf8'), /GOOGLE_PLAY_TRACK/);
});
