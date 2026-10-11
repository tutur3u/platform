import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSandboxMetadata,
  CHROME_SANDBOX,
} from './mail-profile-runtime-sandbox.mjs';

const helper = { isFile: true, uid: 0, gid: 0, mode: 0o104755 };
const parents = Array.from({ length: 4 }, () => ({
  isDirectory: true,
  uid: 0,
  mode: 0o40755,
}));

test('accepts the fixed existing root-owned setuid helper with protected parents', () => {
  assertSandboxMetadata(helper, parents, CHROME_SANDBOX);
});

test('rejects missing and alternate environment selections', () => {
  for (const selected of [undefined, '/tmp/chrome-sandbox']) {
    assert.throws(() => assertSandboxMetadata(helper, parents, selected));
  }
});

test('rejects symlink and nonregular helper metadata', () => {
  assert.throws(() =>
    assertSandboxMetadata({ ...helper, isFile: false }, parents, CHROME_SANDBOX)
  );
});

test('rejects nonroot helper ownership and missing or unsafe setuid modes', () => {
  for (const changed of [
    { uid: 1000 },
    { gid: 1000 },
    { mode: 0o755 },
    { mode: 0o4777 },
  ]) {
    assert.throws(() =>
      assertSandboxMetadata({ ...helper, ...changed }, parents, CHROME_SANDBOX)
    );
  }
});

test('rejects absent, symlink, foreign-owned and writable parent directories', () => {
  assert.throws(() =>
    assertSandboxMetadata(helper, parents.slice(1), CHROME_SANDBOX)
  );
  for (const changed of [
    { isDirectory: false },
    { uid: 1000 },
    { mode: 0o40775 },
    { mode: 0o40757 },
  ]) {
    const unsafe = [{ ...parents[0], ...changed }, ...parents.slice(1)];
    assert.throws(() => assertSandboxMetadata(helper, unsafe, CHROME_SANDBOX));
  }
});
