const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  isVerifiedSignatureOutput,
  parseProperties,
  resolveReleaseSigning,
} = require('./mobile-build-android.js');

function makeMobileRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mobile-android-signing-')
  );
  fs.mkdirSync(path.join(root, 'android/app'), { recursive: true });
  return root;
}

test('parseProperties reads Android signing property files', () => {
  assert.deepEqual(
    parseProperties('# signing\nkeyAlias=upload\nstoreFile=key.jks\n'),
    {
      keyAlias: 'upload',
      storeFile: 'key.jks',
    }
  );
});

test('release signing rejects missing credentials', (t) => {
  const mobileRoot = makeMobileRoot();
  t.after(() => fs.rmSync(mobileRoot, { force: true, recursive: true }));

  assert.throws(
    () => resolveReleaseSigning({ env: {}, mobileRoot }),
    /unsigned release bundles are not allowed/u
  );
});

test('release signing accepts a complete protected environment', (t) => {
  const mobileRoot = makeMobileRoot();
  const keystorePath = path.join(mobileRoot, 'upload.jks');
  fs.writeFileSync(keystorePath, 'fixture');
  t.after(() => fs.rmSync(mobileRoot, { force: true, recursive: true }));

  assert.deepEqual(
    resolveReleaseSigning({
      env: {
        ANDROID_KEYSTORE_ALIAS: 'upload',
        ANDROID_KEYSTORE_PASSWORD: 'store-password',
        ANDROID_KEYSTORE_PATH: keystorePath,
        ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD: 'key-password',
      },
      mobileRoot,
    }),
    { keystorePath, source: 'environment' }
  );
});

test('signature verification rejects an unsigned bundle', () => {
  assert.equal(isVerifiedSignatureOutput('jar verified.'), true);
  assert.equal(
    isVerifiedSignatureOutput('no manifest.\njar is unsigned.'),
    false
  );
});
