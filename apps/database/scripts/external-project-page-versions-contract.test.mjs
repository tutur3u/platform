import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertPageVersionsTap,
  pageVersionsAssertionCount,
  pageVersionsFixture,
  pageVersionsMigrations,
  validatePageVersionsTrackedFiles,
} from './verify-external-project-page-versions-contract.mjs';

const tap = (n) =>
  [
    `1..${n}`,
    ...Array.from({ length: n }, (_, i) => `ok ${i + 1} - assertion ${i + 1}`),
  ].join('\n');

test('all forty-three assertions must pass with no missing, extra, failed or skipped outcome', () => {
  assert.equal(pageVersionsAssertionCount, 43);
  assert.doesNotThrow(() => assertPageVersionsTap(tap(43)));
  for (const invalid of [
    tap(42),
    tap(41),
    tap(43).replace('ok 43', 'not ok 43'),
    tap(43).replace('ok 43 - assertion 43', ''),
    tap(43).replace('assertion 43', 'assertion 43 # SKIP'),
    tap(43).replace('ok 43', 'ok 42'),
    `${tap(43)}\nBail out! incomplete`,
  ])
    assert.throws(() => assertPageVersionsTap(invalid));
});

test('the tracked schema needs config, the fixture and exactly one of each migration', () => {
  const files = [
    'apps/database/supabase/config.toml',
    `apps/database/supabase/tests/${pageVersionsFixture}`,
    ...pageVersionsMigrations,
  ];
  assert.deepEqual(validatePageVersionsTrackedFiles(files), [
    pageVersionsFixture,
  ]);
  for (const missing of files)
    assert.throws(() =>
      validatePageVersionsTrackedFiles(files.filter((f) => f !== missing))
    );
  for (const migration of pageVersionsMigrations)
    assert.throws(() =>
      validatePageVersionsTrackedFiles([
        ...files,
        migration.replace('20261104', '20261105'),
      ])
    );
});

test('the pgTAP suite still declares the counted assertions', () => {
  const suite = readFileSync(
    new URL(`../supabase/tests/${pageVersionsFixture}`, import.meta.url),
    'utf8'
  );
  const assertions = suite.match(
    /^select (?:ok|is|isnt|throws_ok|lives_ok|results_eq|is_empty)\(/gmu
  );
  assert.equal(assertions?.length, pageVersionsAssertionCount);
  assert.match(suite, /^select \* from finish\(\);$/mu);
});
