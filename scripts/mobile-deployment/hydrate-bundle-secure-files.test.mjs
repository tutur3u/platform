import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

// Synthetic fixtures only; none of these values are real credentials.
const posix = process.platform !== 'win32';
const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');

const ANDROID_FILES = {
  android_google_services_json: 'synthetic-google-services',
  android_upload_keystore: 'synthetic-keystore-bytes',
  google_play_service_account_json: 'synthetic-play-service-account',
};
const IOS_FILES = {
  apple_app_store_provisioning_profile: 'synthetic-provisioning-profile',
  apple_distribution_certificate_p12: 'synthetic-p12-bytes',
  app_store_connect_private_key_p8: 'synthetic-p8-key',
  ios_google_service_info_plist: 'synthetic-plist',
};

function bundleFiles(contents) {
  return Object.fromEntries(
    Object.entries(contents).map(([kind, text]) => {
      const bytes = Buffer.from(text);
      return [
        kind,
        {
          base64: bytes.toString('base64'),
          sha256: sha256Hex(bytes),
          size: bytes.byteLength,
        },
      ];
    })
  );
}

function androidBundle(overrides = {}) {
  return {
    envFile: 'API_BASE_URL=https://api.example.test\nTOKEN=abc=def%ghi\n',
    environment: 'production',
    files: bundleFiles(ANDROID_FILES),
    platform: 'android',
    scalarValues: {
      ANDROID_KEYSTORE_ALIAS: 'upload',
      ANDROID_KEYSTORE_PASSWORD: 'store%pass',
      ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD: 'key-pass',
      GOOGLE_PLAY_PACKAGE_NAME: 'com.tuturuuu.app.mobile',
      GOOGLE_PLAY_TRACK: 'internal',
    },
    ...overrides,
  };
}

function iosBundle(overrides = {}) {
  return {
    envFile: 'API_BASE_URL=https://api.example.test\n',
    environment: 'production',
    files: bundleFiles(IOS_FILES),
    platform: 'ios',
    scalarValues: {
      APPLE_BUNDLE_ID: 'com.tuturuuu.app.mobile',
      APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD: 'p12-pass',
      APPLE_TEAM_ID: 'ABCDE12345',
      APP_STORE_CONNECT_API_KEY_ID: 'ABCDE12345',
      APP_STORE_CONNECT_ISSUER_ID: 'synthetic-issuer',
    },
    ...overrides,
  };
}

const workspaces = [];

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'mobile-hydrate-secure-'));
  workspaces.push(root);
  const paths = {
    bundlePath: join(root, 'bundle.json'),
    githubEnv: join(root, 'github-env'),
    mobileRoot: join(root, 'mobile'),
    root,
    runnerTemp: join(root, 'runner-temp'),
  };
  mkdirSync(paths.mobileRoot, { recursive: true });
  mkdirSync(paths.runnerTemp, { recursive: true });
  return paths;
}

function hydrate(paths, bundle, platform = bundle.platform) {
  writeFileSync(paths.bundlePath, JSON.stringify(bundle));
  return spawnSync(
    'node',
    [
      'scripts/mobile-deployment/hydrate-bundle.mjs',
      '--platform',
      platform,
      '--bundle',
      paths.bundlePath,
      '--mobile-root',
      paths.mobileRoot,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ENV: paths.githubEnv,
        RUNNER_TEMP: paths.runnerTemp,
      },
    }
  );
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

const mode = (path) => statSync(path).mode & 0o777;

// Mirrors how the Actions runner reads `NAME<<DELIMITER` blocks from GITHUB_ENV.
function parseGithubEnv(path) {
  const exported = new Map();
  const delimiters = [];
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const heredoc = /^([A-Za-z_][A-Za-z0-9_]*)<<(.+)$/u.exec(lines[index]);
    if (!heredoc) {
      assert.equal(
        lines[index],
        '',
        `unexpected line outside a block: ${lines[index]}`
      );
      continue;
    }
    const [, name, delimiter] = heredoc;
    const value = [];
    index += 1;
    while (index < lines.length && lines[index] !== delimiter) {
      value.push(lines[index]);
      index += 1;
    }
    assert.ok(index < lines.length, `block ${name} was never terminated`);
    assert.ok(!exported.has(name), `${name} exported twice`);
    exported.set(name, value.join('\n'));
    delimiters.push(delimiter);
  }
  return { delimiters, exported };
}

test('Android hydration keeps signing material in runner temp with owner-only modes', {
  skip: !posix,
}, () => {
  const paths = workspace();
  const result = hydrate(paths, androidBundle());
  assert.equal(result.status, 0, result.stderr);

  const keystore = join(
    paths.runnerTemp,
    'mobile-deployment/android-upload-keystore.jks'
  );
  const serviceAccount = join(
    paths.runnerTemp,
    'mobile-deployment/google-play-service-account.json'
  );
  assert.equal(
    readFileSync(keystore, 'utf8'),
    ANDROID_FILES.android_upload_keystore
  );
  assert.equal(
    readFileSync(serviceAccount, 'utf8'),
    ANDROID_FILES.google_play_service_account_json
  );

  for (const file of [
    keystore,
    serviceAccount,
    join(paths.mobileRoot, '.env.github'),
    join(paths.mobileRoot, 'android/app/src/production/google-services.json'),
  ]) {
    assert.equal(mode(file), 0o600, `${file} must be owner read/write only`);
  }
  assert.equal(mode(join(paths.runnerTemp, 'mobile-deployment')), 0o700);

  // Nothing secret may land inside the checked-out mobile app tree.
  assert.deepEqual(listFiles(paths.mobileRoot).sort(), [
    '.env.github',
    'android/app/src/production/google-services.json',
  ]);
  for (const file of listFiles(paths.mobileRoot)) {
    const contents = readFileSync(join(paths.mobileRoot, file), 'utf8');
    assert.ok(!contents.includes(ANDROID_FILES.android_upload_keystore));
    assert.ok(
      !contents.includes(ANDROID_FILES.google_play_service_account_json)
    );
  }
});

test('hydration tightens permissive modes on files that already exist', {
  skip: !posix,
}, () => {
  const paths = workspace();
  const envPath = join(paths.mobileRoot, '.env.github');
  const keystoreDirectory = join(paths.runnerTemp, 'mobile-deployment');
  const keystorePath = join(keystoreDirectory, 'android-upload-keystore.jks');
  mkdirSync(keystoreDirectory, { recursive: true, mode: 0o755 });
  writeFileSync(envPath, 'STALE=1\n', { mode: 0o644 });
  writeFileSync(keystorePath, 'stale-keystore', { mode: 0o666 });
  chmodSync(envPath, 0o644);
  chmodSync(keystorePath, 0o666);

  const result = hydrate(paths, androidBundle());
  assert.equal(result.status, 0, result.stderr);

  assert.equal(mode(envPath), 0o600);
  assert.equal(mode(keystorePath), 0o600);
  assert.equal(readFileSync(envPath, 'utf8'), androidBundle().envFile);
  assert.equal(
    readFileSync(keystorePath, 'utf8'),
    ANDROID_FILES.android_upload_keystore
  );
});

test('iOS hydration keeps certificates, profile and API key out of the app tree', {
  skip: !posix,
}, () => {
  const paths = workspace();
  const result = hydrate(paths, iosBundle());
  assert.equal(result.status, 0, result.stderr);

  assert.deepEqual(listFiles(paths.mobileRoot).sort(), [
    '.env.github',
    'ios/Runner/GoogleService-Info-production.plist',
    'ios/Runner/GoogleService-Info.plist',
  ]);
  assert.deepEqual(listFiles(paths.runnerTemp).sort(), [
    'mobile-deployment/app-store.mobileprovision',
    'mobile-deployment/apple-distribution.p12',
    'mobile-deployment/private_keys/AuthKey_ABCDE12345.p8',
  ]);
  for (const file of listFiles(paths.runnerTemp)) {
    assert.equal(mode(join(paths.runnerTemp, file)), 0o600, `${file} mode`);
  }
  assert.equal(
    mode(join(paths.runnerTemp, 'mobile-deployment/private_keys')),
    0o700
  );

  const exported = parseGithubEnv(paths.githubEnv).exported;
  assert.equal(
    exported.get('APP_STORE_CONNECT_PRIVATE_KEY_PATH'),
    join(
      paths.runnerTemp,
      'mobile-deployment/private_keys/AuthKey_ABCDE12345.p8'
    )
  );
  assert.equal(
    exported.get('API_PRIVATE_KEYS_DIR'),
    join(paths.runnerTemp, 'mobile-deployment/private_keys')
  );
});

test('a file that fails its integrity check is never written and stops hydration', () => {
  const paths = workspace();
  const bundle = androidBundle();
  bundle.files.android_upload_keystore.sha256 = sha256Hex(
    Buffer.from('different')
  );

  const result = hydrate(paths, bundle);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 mismatch for android_upload_keystore/);
  const written = listFiles(paths.runnerTemp);
  assert.deepEqual(written, []);
  assert.ok(
    !existsSync(
      join(
        paths.runnerTemp,
        'mobile-deployment/google-play-service-account.json'
      )
    )
  );
  assert.ok(
    !existsSync(paths.githubEnv) ||
      !readFileSync(paths.githubEnv, 'utf8').includes('ANDROID_KEYSTORE_PATH')
  );
  assert.ok(
    !(result.stdout + result.stderr).includes(
      bundle.files.android_upload_keystore.base64
    )
  );
  assert.ok(
    !(result.stdout + result.stderr).includes(
      ANDROID_FILES.android_upload_keystore
    )
  );
});

test('a declared size that differs from the decoded bytes is rejected', () => {
  const paths = workspace();
  const bundle = androidBundle();
  bundle.files.google_play_service_account_json.size += 1;

  const result = hydrate(paths, bundle);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /SHA-256 mismatch for google_play_service_account_json/
  );
  assert.ok(
    !existsSync(
      join(
        paths.runnerTemp,
        'mobile-deployment/google-play-service-account.json'
      )
    )
  );
});

test('a bundle missing a required file kind fails without writing that file', () => {
  const paths = workspace();
  const bundle = androidBundle();
  delete bundle.files.android_upload_keystore;

  const result = hydrate(paths, bundle);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing bundle file: android_upload_keystore/);
  assert.deepEqual(listFiles(paths.runnerTemp), []);
});

test('identity mismatches are rejected before any file or env export is written', () => {
  const cases = [
    [
      'environment',
      androidBundle({ environment: 'staging' }),
      /Bundle environment must be production/,
    ],
    [
      'platform',
      androidBundle({ platform: 'ios' }),
      /Bundle platform must be android/,
      'android',
    ],
    [
      'package name',
      androidBundle({
        scalarValues: {
          ...androidBundle().scalarValues,
          GOOGLE_PLAY_PACKAGE_NAME: 'com.attacker.app',
        },
      }),
      /GOOGLE_PLAY_PACKAGE_NAME must be com\.tuturuuu\.app\.mobile/,
    ],
    [
      'play track',
      androidBundle({
        scalarValues: {
          ...androidBundle().scalarValues,
          GOOGLE_PLAY_TRACK: 'production',
        },
      }),
      /GOOGLE_PLAY_TRACK must be internal/,
    ],
  ];

  for (const [label, bundle, message, platform] of cases) {
    const paths = workspace();
    const result = hydrate(paths, bundle, platform);
    assert.equal(result.status, 1, label);
    assert.match(result.stderr, message, label);
    assert.deepEqual(listFiles(paths.mobileRoot), [], `${label}: app tree`);
    assert.deepEqual(listFiles(paths.runnerTemp), [], `${label}: runner temp`);
    assert.ok(!existsSync(paths.githubEnv), `${label}: GITHUB_ENV`);
    assert.ok(
      !result.stdout.includes('::add-mask::'),
      `${label}: masks before validation`
    );
  }

  const paths = workspace();
  const bundle = iosBundle({
    scalarValues: {
      ...iosBundle().scalarValues,
      APPLE_BUNDLE_ID: 'com.attacker.app',
    },
  });
  const result = hydrate(paths, bundle);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /APPLE_BUNDLE_ID must be com\.tuturuuu\.app\.mobile/
  );
  assert.deepEqual(listFiles(paths.mobileRoot), []);
});

test('scalar and env values are masked with workflow-command escaping', () => {
  const paths = workspace();
  const result = hydrate(
    paths,
    androidBundle({
      scalarValues: {
        ...androidBundle().scalarValues,
        ANDROID_KEYSTORE_PASSWORD: 'store%pass',
        ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD: 'line-one\nline-two',
      },
    })
  );
  assert.equal(result.status, 0, result.stderr);

  const masks = result.stdout
    .split('\n')
    .filter((line) => line.startsWith('::add-mask::'))
    .map((line) => line.slice('::add-mask::'.length));
  assert.ok(masks.includes('store%25pass'));
  assert.ok(masks.includes('line-one%0Aline-two'));
  // Only the part after the first "=" of an env line is a value.
  assert.ok(masks.includes('abc=def%25ghi'));
  assert.ok(masks.includes('https://api.example.test'));
  for (const text of Object.values(ANDROID_FILES)) {
    assert.ok(
      !result.stdout.includes(text),
      'file contents must never be printed'
    );
  }
  assert.ok(
    !result.stdout.includes('\nline-two'),
    'a masked value must not leak onto a second log line'
  );
});

test('multi-line values cannot inject extra variables into GITHUB_ENV', () => {
  const paths = workspace();
  const result = hydrate(
    paths,
    androidBundle({
      scalarValues: {
        ...androidBundle().scalarValues,
        ANDROID_KEYSTORE_ALIAS:
          'upload\nINJECTED=1\nANDROID_KEYSTORE_PATH=/tmp/attacker',
      },
    })
  );
  assert.equal(result.status, 0, result.stderr);

  const { delimiters, exported } = parseGithubEnv(paths.githubEnv);
  assert.deepEqual([...exported.keys()].sort(), [
    'ANDROID_KEYSTORE_ALIAS',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD',
    'GOOGLE_PLAY_PACKAGE_NAME',
    'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH',
    'GOOGLE_PLAY_TRACK',
  ]);
  assert.equal(
    exported.get('ANDROID_KEYSTORE_ALIAS'),
    'upload\nINJECTED=1\nANDROID_KEYSTORE_PATH=/tmp/attacker'
  );
  assert.equal(
    exported.get('ANDROID_KEYSTORE_PATH'),
    join(paths.runnerTemp, 'mobile-deployment/android-upload-keystore.jks')
  );
  assert.equal(
    new Set(delimiters).size,
    delimiters.length,
    'delimiters must be unique per variable'
  );
  assert.ok(
    delimiters.every((delimiter) =>
      /^MOBILE_DEPLOY_[0-9a-f-]{36}$/u.test(delimiter)
    )
  );
});

test.after(() => {
  for (const root of workspaces) {
    rmSync(root, { force: true, recursive: true });
  }
});
