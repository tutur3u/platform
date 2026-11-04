import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setup } from './external-project-page-versions.test.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const ws = '7a9e0000-0000-4000-8000-00000000000a';
const entry = '7a9e0000-0000-4000-8000-0000000002aa';
const actor = '7a9e0000-0000-4000-8000-0000000000c1';
test('unpublish atomically clears the pointer and audit, denies editors, and fails closed', async () => {
  const db = await setup();
  try {
    await db.exec(
      await read(
        'supabase/migrations/20261104143000_external_project_page_unpublish.sql'
      )
    );
    const fixture = await read(
      'supabase/tests/external-project-page-versions.sql'
    );
    await db.exec(
      fixture.slice(0, fixture.indexOf('-- Deleting an entry')) +
        'reset role; commit;'
    );
    await db.exec(
      `set role service_role; set request.jwt.claims = '{"role":"service_role"}';`
    );
    await assert.rejects(
      db.query(
        `select public.unpublish_workspace_external_project_page('${ws}', '${entry}', '7a9e0000-0000-4000-8000-0000000000e1')`
      ),
      /not allowed/
    );
    await db.exec(`reset role; create function pg_temp.reject_unpublish() returns trigger language plpgsql as $$ begin raise exception 'audit down'; end $$;
      create trigger reject_unpublish before insert on public.workspace_external_project_publish_events for each row execute function pg_temp.reject_unpublish();
      set role service_role;`);
    await assert.rejects(
      db.query(
        `select public.unpublish_workspace_external_project_page('${ws}', '${entry}', '${actor}')`
      ),
      /audit down/
    );
    assert.notEqual(
      (
        await db.query(
          `select published_page_version_id from public.workspace_external_project_entries where id='${entry}'`
        )
      ).rows[0].published_page_version_id,
      null
    );
    await db.exec(
      'reset role; drop trigger reject_unpublish on public.workspace_external_project_publish_events; set role service_role;'
    );
    const result = await db.query(
      `select (public.unpublish_workspace_external_project_page('${ws}', '${entry}', '${actor}')).published_page_version_id as pointer`
    );
    assert.equal(result.rows[0].pointer, null);
    assert.equal(
      (
        await db.query(
          `select * from public.get_published_workspace_external_project_page_version('${ws}', '${entry}')`
        )
      ).rows.length,
      0
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as count from public.workspace_external_project_publish_events where entry_id='${entry}' and event_kind='unpublish'`
        )
      ).rows[0].count,
      1
    );
    await db.exec('reset role;');
    await db.exec(
      await read(
        'rollbacks/20261104143000_external_project_page_unpublish.rollback.sql'
      )
    );
  } finally {
    await db.close();
  }
});
