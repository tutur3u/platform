const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_DEBUG_ALIAS,
  DEFAULT_DEBUG_PASSWORD,
  DEFAULT_REPO_KEY_PROPERTIES_FILE,
  inspectAndroidSigningCertificate,
  loadKeyPropertiesFile,
  main,
  parseArgs,
  resolveKeystoreInput,
} = require('./android-self-sign.js');

test('parseArgs captures android signer options', () => {
  const parsed = parseArgs([
    '--keystore',
    './release.jks',
    '--alias',
    'upload',
    '--store-password',
    'secret',
    '--key-password',
    'key-secret',
    '--key-properties-file',
    './apps/mobile/android/key.properties',
    '--json',
  ]);

  assert.deepEqual(parsed, {
    alias: 'upload',
    json: true,
    keyPassword: 'key-secret',
    keyPropertiesFile: './apps/mobile/android/key.properties',
    keystore: './release.jks',
    storePassword: 'secret',
    debug: false,
  });
});

test('loadKeyPropertiesFile parses Android key.properties', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-self-sign-'));
  const keyPropertiesPath = path.join(tempDir, 'key.properties');
  fs.writeFileSync(
    keyPropertiesPath,
    [
      'storeFile=upload-keystore.jks',
      'storePassword=store-secret',
      'keyAlias=upload',
      'keyPassword=key-secret',
    ].join('\n')
  );

  const result = loadKeyPropertiesFile(keyPropertiesPath);

  assert.equal(result.path, keyPropertiesPath);
  assert.deepEqual(result.properties, {
    keyAlias: 'upload',
    keyPassword: 'key-secret',
    storeFile: 'upload-keystore.jks',
    storePassword: 'store-secret',
  });
});

test('resolveKeystoreInput mirrors repo mobile signing defaults', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-self-sign-'));
  const keyPropertiesDir = path.join(tempDir, 'apps/mobile/android');
  fs.mkdirSync(keyPropertiesDir, { recursive: true });
  const keyPropertiesPath = path.join(
    tempDir,
    DEFAULT_REPO_KEY_PROPERTIES_FILE
  );
  fs.writeFileSync(
    keyPropertiesPath,
    [
      'storeFile=upload-keystore.jks',
      'storePassword=store-secret',
      'keyAlias=upload',
    ].join('\n')
  );

  const result = resolveKeystoreInput(
    {},
    {
      cwd: tempDir,
      env: {},
    }
  );

  assert.equal(result.mode, 'keystore');
  assert.equal(result.alias, 'upload');
  assert.equal(result.storePassword, 'store-secret');
  assert.equal(result.keyPropertiesFile, keyPropertiesPath);
  assert.equal(
    result.keystore,
    path.join(tempDir, 'apps/mobile/android/app/upload-keystore.jks')
  );
});

test('inspectAndroidSigningCertificate parses keytool output for a keystore', () => {
  const executed = [];
  const result = inspectAndroidSigningCertificate(
    {
      alias: 'upload',
      keystore: './release.jks',
      storePassword: 'store-secret',
    },
    {
      cwd: '/workspace',
      env: {},
      execFileSync: (command, args) => {
        executed.push({ args, command });
        return [
          'Alias name: upload',
          'MD5: AA:BB:CC',
          'SHA1: 11:22:33',
          'SHA-256: 44:55:66',
        ].join('\n');
      },
    }
  );

  assert.deepEqual(executed, [
    {
      args: [
        '-list',
        '-v',
        '-alias',
        'upload',
        '-keystore',
        '/workspace/release.jks',
        '-storepass',
        'store-secret',
      ],
      command: 'keytool',
    },
  ]);
  assert.equal(result.sha1, '11:22:33');
  assert.equal(result.sha256, '44:55:66');
  assert.equal(result.md5, 'AA:BB:CC');
});

test('main prints JSON for the default debug keystore mode', () => {
  const stdout = [];
  const stderr = [];
  const exitCode = main(
    ['--debug', '--json'],
    { write: (value) => stdout.push(value) },
    { write: (value) => stderr.push(value) },
    {
      env: {},
      execFileSync: (command, args) => {
        assert.equal(command, 'keytool');
        assert.deepEqual(args, [
          '-list',
          '-v',
          '-alias',
          DEFAULT_DEBUG_ALIAS,
          '-keystore',
          path.join(os.homedir(), '.android/debug.keystore'),
          '-storepass',
          DEFAULT_DEBUG_PASSWORD,
        ]);

        return 'SHA1: A1:B2:C3\nSHA-256: D4:E5:F6\n';
      },
    }
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(stderr, []);

  const output = JSON.parse(stdout.join(''));
  assert.equal(output.inputType, 'keystore');
  assert.equal(output.sha1, 'A1:B2:C3');
  assert.equal(output.sha256, 'D4:E5:F6');
  assert.equal(output.source, 'debug-keystore');
});
