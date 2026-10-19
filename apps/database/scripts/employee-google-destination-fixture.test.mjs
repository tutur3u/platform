import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
import {
  assertRollbackSource,
  selectSchemaPackets,
} from './employee-schema-tap.mjs';
import providerConfig from './fixtures/employee-address-migration/vitest.provider.config.mts';

const file = 'employee-google-destination-migration.sql';
const sql = readFileSync(
  new URL(`../supabase/tests/${file}`, import.meta.url),
  'utf8'
);

test('the selected Google packet has its exact authored assertion count and rollback closure', () => {
  assertRollbackSource(sql);
  const selected = selectSchemaPackets(false, false, true).find(
    ([name]) => name === file
  );
  assert.ok(selected);
  assert.equal(selected[1], 30);
  assert.match(sql, /select plan\(30\);/u);
  assert.equal(
    [...sql.matchAll(/^select (?:is|isnt|ok|throws_ok)\(/gmu)].length,
    selected[1]
  );
  assert.throws(() =>
    assertRollbackSource(sql.replace(/rollback;\s*$/u, 'commit;'))
  );
});

test('real Vite Oxc transforms both provider suites with the owned config in a cold workspace', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'employee-provider-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const database = path.join(root, 'apps/database');
  const fixture = path.join(
    database,
    'scripts/fixtures/employee-address-migration'
  );
  mkdirSync(fixture, { recursive: true });
  const base = path.join(root, 'packages/typescript-config');
  mkdirSync(base, { recursive: true });
  writeFileSync(
    path.join(base, 'base.json'),
    readFileSync(
      new URL('../../../packages/typescript-config/base.json', import.meta.url)
    )
  );
  const expectedConfig = fileURLToPath(
    new URL(
      './fixtures/employee-address-migration/tsconfig.provider.json',
      import.meta.url
    )
  );
  assert.equal(providerConfig.tsconfig, expectedConfig);
  const explicit = path.resolve(
    database,
    path.relative(providerConfig.root, providerConfig.tsconfig)
  );
  writeFileSync(explicit, readFileSync(expectedConfig));
  // No node_modules/config package exists in this cold tree. Automatic lookup
  // must fail, while the exact owned relative base remains independently usable.
  writeFileSync(
    path.join(database, 'tsconfig.json'),
    JSON.stringify({
      extends: '@tuturuuu/typescript-config/react-library.json',
    })
  );
  assert.equal(providerConfig.test.environment, 'node');
  assert.equal(providerConfig.test.maxWorkers, 1);
  assert.equal(providerConfig.test.fileParallelism, false);
  assert.deepEqual(providerConfig.test.include, [
    'scripts/fixtures/employee-address-migration/google-preservation.test.ts',
    'scripts/fixtures/employee-address-migration/provider-cleanup.test.ts',
  ]);
  for (const relative of providerConfig.test.include) {
    const source = readFileSync(
      path.resolve(providerConfig.root, relative),
      'utf8'
    );
    const filename = path.resolve(database, relative);
    writeFileSync(filename, source);
    await assert.rejects(
      transformWithOxc(source, filename, undefined, undefined, {
        root: database,
      }),
      /Failed to load tsconfig '@tuturuuu\/typescript-config\/react-library.json'/
    );
    const transformed = await transformWithOxc(
      source,
      filename,
      undefined,
      undefined,
      { ...providerConfig, root: database, tsconfig: explicit }
    );
    assert.ok(transformed.code.includes('describe('));
    assert.equal(
      [...transformed.code.matchAll(/\bit\(/g)].length,
      [...source.matchAll(/\bit\(/g)].length
    );
    await assert.rejects(
      transformWithOxc(source, filename, undefined, undefined, {
        root: database,
        tsconfig: path.join(fixture, 'missing-provider.json'),
      }),
      /missing-provider\.json/
    );
  }
});
