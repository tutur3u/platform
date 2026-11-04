// CMS page versions on a synthetic in-memory PGlite schema: the real caller-
// bound helpers, entry policies and page-version migration, then the pgTAP
// suite, then the static rollback and a re-apply. No real database involved.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const MIGRATION =
  'supabase/migrations/20261104140000_external_project_page_versions.sql';
const PERMISSION =
  'supabase/migrations/20261104135900_external_project_edit_permission.sql';
const PERMISSION_ROLLBACK =
  'rollbacks/20261104135900_external_project_edit_permission.rollback.sql';
const ROLLBACK =
  'rollbacks/20261104140000_external_project_page_versions.rollback.sql';

async function canonical(migration, start, end) {
  const source = await read(`supabase/migrations/${migration}`);
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`${start} not found in ${migration}`);
  return source.slice(from, to + end.length);
}

async function setup() {
  const db = new PGlite({ extensions: { pgtap } });
  await db.exec(
    await read('scripts/fixtures/external-project-page-versions-schema.sql')
  );
  await db.exec('create extension pgtap with schema extensions;');
  await db.exec(
    await read(
      'supabase/migrations/20261030130000_bind_external_project_helpers_to_caller.sql'
    )
  );
  // Main's entry policies, exactly as shipped.
  for (const policy of ['read entries', 'mutate entries']) {
    await db.exec(
      await canonical(
        '20260401190000_external_project_studio.sql',
        `CREATE POLICY "Workspace external project ${policy === 'read entries' ? 'publishers can' : 'managers can'} ${policy}"`,
        ';'
      )
    );
  }
  // Main's publish event policies, exactly as shipped.
  for (const action of ['read', 'create']) {
    await db.exec(
      await canonical(
        '20260401190000_external_project_studio.sql',
        `CREATE POLICY "Workspace external project publishers can ${action} publish events"`,
        ';'
      )
    );
  }
  await db.exec(await read(PERMISSION));
  await db.exec(await read(MIGRATION));
  return db;
}

async function runTap(db) {
  const results = await db.exec(
    await read('supabase/tests/external-project-page-versions.sql')
  );
  return results
    .flatMap((result) => result.rows.flatMap((row) => Object.values(row)))
    .filter((value) => typeof value === 'string')
    .flatMap((value) => value.split('\n'));
}

const catalog = async (db) =>
  (
    await db.query(`select
      to_regclass('public.workspace_external_project_page_versions') is not null as version_table,
      exists (select 1 from information_schema.columns where table_name = 'workspace_external_project_entries'
        and column_name = 'published_page_version_id') as pointer,
      (select count(*)::int from pg_proc where proname in ('publish_workspace_external_project_page_version',
        'prepare_workspace_external_project_page_version',
        'guard_workspace_external_project_published_page_version',
        'get_published_workspace_external_project_page_version',
        'can_edit_workspace_external_projects')) as functions`)
  ).rows[0];

test('pgTAP suite passes, rollback removes everything, and the migration re-applies', async () => {
  const db = await setup();
  try {
    const lines = await runTap(db);
    const assertions = lines.filter((line) => /^(not )?ok \d+/.test(line));
    const failures = lines.filter((line) => /^not ok|^# Looks like/.test(line));
    assert.ok(
      assertions.length >= 40,
      `expected the full suite, got ${assertions.length}`
    );
    assert.deepEqual(failures, [], lines.join('\n'));

    assert.deepEqual(await catalog(db), {
      version_table: true,
      pointer: true,
      functions: 5,
    });
    await db.exec(await read(ROLLBACK));
    await db.exec(await read(PERMISSION_ROLLBACK));
    assert.deepEqual(await catalog(db), {
      version_table: false,
      pointer: false,
      functions: 0,
    });

    await db.exec(await read(PERMISSION));
    await db.exec(await read(MIGRATION));
    const again = await runTap(db);
    assert.deepEqual(
      again.filter((line) => /^not ok/.test(line)),
      [],
      'suite passes after re-apply'
    );
  } finally {
    await db.close();
  }
});
