const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { listSqlFiles, scanSql } = require('./sql-grant-guard');
const { checkRepository } = require('./security-definer-guard');
const scope = () => require('./sql-guard-scope');
const root = path.resolve(__dirname, '../..');

test('every repository SQL directory is explicitly admitted', () => {
  assert.deepEqual(scope().unlistedSqlFiles(root), []);
});

test('an unlisted SQL directory fails inventory and is still scanned by both guards', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-scope-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const file = 'new-app/db/probe.sql';
  fs.mkdirSync(path.join(tmp, 'new-app/db'), { recursive: true });
  fs.writeFileSync(path.join(tmp, file), `CREATE FUNCTION public.probe() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;`);
  assert.deepEqual(listSqlFiles(tmp), [file]);
  assert.ok(require('./sql-grant-guard-baseline').collectDiagnostics({ files: [file], readFile: () => fs.readFileSync(path.join(tmp, file), 'utf8') }).length);
  assert.ok(scanSql(fs.readFileSync(path.join(tmp, file), 'utf8'), { definerRule: true }).length);
  assert.ok(checkRepository({ root: tmp, baseline: [], historicalBlocks: [], reviewedBlocks: [] }).length);
  assert.deepEqual(scope().unlistedSqlFiles(tmp), [file]);
});

test('both guards discover SQL in all newly covered applications', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-scope-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const files = ['apps/lettin/migrations/probe.sql', 'apps/hive/db/migrations/probe.sql', 'apps/supermemory/db/probe.sql'];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
    fs.writeFileSync(path.join(tmp, file), 'GRANT SELECT ON public.secret TO anon;');
  }
  assert.deepEqual(listSqlFiles(tmp), [...files].sort());
});
