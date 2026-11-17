import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { prepare, verify } from './wave1-native-artifact.mjs';
const { fixture } = createRequire(import.meta.url)(
  './wave1-native-test-fixture.cjs'
);
test('restored seal refuses a mismatched policy digest', (t) => {
  const dir = fixture(t, 'finance');
  const sha = 'a'.repeat(40);
  prepare(dir, 'finance', 'production', undefined, sha);
  assert.ok(verify(dir, 'finance', 'production', sha));
  const path = join(dir, 'wave1-artifact.json');
  const original = readFileSync(path, 'utf8');
  const receipt = JSON.parse(original);
  receipt.policySha256 = '0'.repeat(64);
  writeFileSync(path, JSON.stringify(receipt));
  assert.throws(() => verify(dir, 'finance', 'production', sha));
  writeFileSync(path, original);
  assert.ok(verify(dir, 'finance', 'production', sha));
});
