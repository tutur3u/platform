#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_ROOT = path.join(ROOT_DIR, 'apps/mobile');
const AAB_PATH = path.join(
  MOBILE_ROOT,
  'build/app/outputs/bundle/productionRelease/app-production-release.aab'
);

function parseProperties(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return separator === -1
          ? [line, '']
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

function resolveReleaseSigning({
  env = process.env,
  mobileRoot = MOBILE_ROOT,
} = {}) {
  const environmentKeys = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_ALIAS',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD',
  ];
  const suppliedEnvironmentKeys = environmentKeys.filter((key) => env[key]);

  if (suppliedEnvironmentKeys.length > 0) {
    if (suppliedEnvironmentKeys.length !== environmentKeys.length) {
      throw new Error(
        'Android release signing environment is incomplete. Configure every ANDROID_KEYSTORE_* value.'
      );
    }

    const keystorePath = path.resolve(env.ANDROID_KEYSTORE_PATH);
    if (!fs.existsSync(keystorePath)) {
      throw new Error(
        `Android release keystore does not exist: ${keystorePath}`
      );
    }

    return { keystorePath, source: 'environment' };
  }

  const propertiesPath = path.join(mobileRoot, 'android/key.properties');
  if (fs.existsSync(propertiesPath)) {
    const properties = parseProperties(fs.readFileSync(propertiesPath, 'utf8'));
    const requiredProperties = [
      'storeFile',
      'keyAlias',
      'storePassword',
      'keyPassword',
    ];
    if (requiredProperties.some((key) => !properties[key])) {
      throw new Error(
        'android/key.properties is incomplete. Configure storeFile, keyAlias, storePassword, and keyPassword.'
      );
    }

    const keystorePath = path.resolve(
      mobileRoot,
      'android/app',
      properties.storeFile
    );
    if (!fs.existsSync(keystorePath)) {
      throw new Error(
        `Android release keystore does not exist: ${keystorePath}`
      );
    }

    return { keystorePath, source: 'key.properties' };
  }

  throw new Error(
    'Android production releases require the protected upload keystore. Configure ANDROID_KEYSTORE_* or android/key.properties; unsigned release bundles are not allowed.'
  );
}

function findJarsigner(env = process.env) {
  const candidates = [
    env.JAVA_HOME && path.join(env.JAVA_HOME, 'bin/jarsigner'),
    path.join(
      os.homedir(),
      'Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/jarsigner'
    ),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/jarsigner',
  ].filter(Boolean);

  return (
    candidates.find((candidate) => fs.existsSync(candidate)) || 'jarsigner'
  );
}

function isVerifiedSignatureOutput(output) {
  return /jar verified\./iu.test(output) && !/jar is unsigned/iu.test(output);
}

function assertSignedBundle({ aabPath = AAB_PATH, env = process.env } = {}) {
  if (!fs.existsSync(aabPath)) {
    throw new Error(`Android App Bundle was not produced: ${aabPath}`);
  }

  const result = spawnSync(
    findJarsigner(env),
    ['-verify', '-verbose', '-certs', aabPath],
    {
      encoding: 'utf8',
    }
  );
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (
    result.error ||
    result.status !== 0 ||
    !isVerifiedSignatureOutput(output)
  ) {
    throw new Error(
      `Android App Bundle signature verification failed.${result.error ? ` ${result.error.message}` : ''}`
    );
  }

  return true;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function resolveFlutterBuildArgs(argv = process.argv.slice(2)) {
  return [...argv];
}

function main(argv = process.argv.slice(2)) {
  const signing = resolveReleaseSigning();
  const dartDefineFile =
    process.env.MOBILE_DART_DEFINE_FILE || '.env.production';
  const buildArgs = resolveFlutterBuildArgs(argv);

  console.log(
    `Building Android production release with ${signing.source} signing.`
  );
  runCommand(
    'flutter',
    [
      'build',
      'aab',
      `--dart-define-from-file=${dartDefineFile}`,
      '--flavor',
      'production',
      '--target',
      'lib/main_production.dart',
      ...buildArgs,
    ],
    { cwd: MOBILE_ROOT }
  );
  assertSignedBundle();
  console.log(`Verified signed Android App Bundle: ${AAB_PATH}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  assertSignedBundle,
  findJarsigner,
  isVerifiedSignatureOutput,
  parseProperties,
  resolveFlutterBuildArgs,
  resolveReleaseSigning,
};
