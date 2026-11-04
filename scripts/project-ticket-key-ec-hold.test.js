const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// The project ticket key migrations must never write the held workspace's
// data. Every data write they run at migration time (UPDATE, INSERT or DELETE
// on a public table, outside a function body) has to exclude it by ID in the
// same statement. Trigger and function bodies run later, on a caller's own
// write, so they are out of scope here; pgTAP covers their behavior.
const HELD_WORKSPACE = '42529372-c669-4833-bb32-2cab1f4ffd83';
const MIGRATIONS_DIR = path.join(
  __dirname,
  '..',
  'apps/database/supabase/migrations'
);
const TICKET_KEY_MIGRATION =
  /^\d{14}_project_ticket_(?:key|keys|key_search|key_board_prefixes|number_lock_order)\.sql$/u;

// Writes whose source rows were already filtered by the held-workspace
// exclusion in the same migration. Each entry names that filter.
const FILTERED_SOURCE_WRITES = [
  {
    file: /_project_ticket_keys\.sql$/u,
    statement:
      /^update public\.task_projects project set ticket_key = backfill\.ticket_key\s+from project_ticket_key_backfill backfill/u,
    reason:
      'project_ticket_key_backfill is filled only by the DO block that selects ws_id <> the held workspace',
  },
];

function stripSql(sql) {
  return (
    sql
      .replace(/--[^\n]*/gu, '')
      // Function bodies, including CREATE OR REPLACE inside DO blocks.
      .replace(
        /create\s+(?:or\s+replace\s+)?function[\s\S]*?\bas\s+(\$\w*\$)[\s\S]*?\1/giu,
        'create function <body>'
      )
      // Dollar-quoted literals other than DO block bodies.
      .replace(/(\$(?:replacement|old|patched)\$)[\s\S]*?\1/gu, "''")
      .replace(/'(?:[^']|'')*'/gu, (literal) =>
        literal.includes(HELD_WORKSPACE) ? literal : "''"
      )
  );
}

function dataWrites(sql) {
  return stripSql(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/gu, ' ').trim())
    .filter((statement) =>
      /\b(?:update|insert\s+into|delete\s+from)\s+public\.\w+/iu.test(statement)
    );
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((file) => TICKET_KEY_MIGRATION.test(file))
  .sort();

test('the project ticket key migrations are present', () => {
  assert.ok(
    files.length >= 4,
    `expected the ticket key migrations, found ${files.join(', ')}`
  );
});

for (const file of files) {
  test(`${file} excludes the held workspace from every data write`, () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of dataWrites(sql)) {
      if (statement.includes(HELD_WORKSPACE)) continue;
      const allowed = FILTERED_SOURCE_WRITES.find(
        (entry) => entry.file.test(file) && entry.statement.test(statement)
      );
      assert.ok(
        allowed,
        `${file}: this write does not exclude workspace ${HELD_WORKSPACE}:\n${statement}`
      );
    }
  });
}

test('the backfill source table excludes the held workspace', () => {
  const file = files.find((name) => name.endsWith('_project_ticket_keys.sql'));
  assert.ok(file, 'missing the project ticket keys migration');
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  assert.match(
    sql,
    new RegExp(
      `select id, ws_id, name from public\\.task_projects\\s+where ws_id <> '${HELD_WORKSPACE}'::uuid`,
      'u'
    )
  );
});

test('the checker flags a write that omits the held workspace', () => {
  const writes = dataWrites(
    "update public.task_projects set ticket_key = 'X';\nupdate public.task_projects set ticket_key = 'Y' where ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid;"
  );
  assert.equal(writes.length, 2);
  assert.equal(writes[0].includes(HELD_WORKSPACE), false);
  assert.equal(writes[1].includes(HELD_WORKSPACE), true);
});

test('the checker ignores trigger bodies and patched function text', () => {
  const writes =
    dataWrites(`create or replace function private.f() returns trigger language plpgsql as $$
begin update public.task_projects set next_ticket_number = 2; return new; end;
$$;
do $m$ begin definition := replace(definition, 'delete from public.task_project_tasks where task_id = p_task_id;', $replacement$delete from public.task_project_tasks;$replacement$); end; $m$;`);
  assert.deepEqual(writes, []);
});
