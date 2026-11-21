// pgTAP runs with only apps/database/supabase/tests mounted, so a test that
// replays a migration includes a verbatim copy from tests/helpers. Each copy
// starts with a two-line header naming its migration and must otherwise match
// that migration byte for byte, so the test exercises the SQL that ships.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SUPABASE_DIR = path.join(
  __dirname,
  '..',
  '..',
  'apps',
  'database',
  'supabase'
);
const HELPERS_DIR = path.join(SUPABASE_DIR, 'tests', 'helpers');
const HEADER =
  /^-- Verbatim copy of migrations\/(\d{14}_[a-z0-9_]+\.sql)\n--[^\n]*\n/;

function migrationCopies() {
  return fs
    .readdirSync(HELPERS_DIR)
    .filter((name) => name.endsWith('.inc'))
    .map((name) => ({
      name,
      contents: fs.readFileSync(path.join(HELPERS_DIR, name), 'utf8'),
    }))
    .filter(({ contents }) =>
      contents.startsWith('-- Verbatim copy of migrations/')
    );
}

test('at least one pgTAP helper replays a migration', () => {
  assert.ok(migrationCopies().length > 0);
});

for (const { name, contents } of migrationCopies()) {
  test(`${name} matches the migration it copies`, () => {
    const header = contents.match(HEADER);
    assert.ok(header, `${name} needs the two-line verbatim-copy header`);
    const migrationPath = path.join(SUPABASE_DIR, 'migrations', header[1]);
    assert.ok(fs.existsSync(migrationPath), `${header[1]} does not exist`);
    assert.equal(
      contents.slice(header[0].length),
      fs.readFileSync(migrationPath, 'utf8'),
      `${name} differs from ${header[1]}`
    );
  });
}
