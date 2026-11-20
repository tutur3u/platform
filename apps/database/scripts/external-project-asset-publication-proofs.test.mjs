import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('publication proof migration keeps proof writes and reads behind the service role', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      grant usage on schema private to anon, authenticated, service_role;

      create table public.workspaces(id uuid primary key);
      create table public.canonical_external_projects(id text primary key);
      create table public.workspace_external_project_entries(id uuid primary key);
      insert into public.workspaces values ('11111111-1111-4111-8111-111111111111');
      insert into public.canonical_external_projects values ('fixture');
      insert into public.workspace_external_project_entries values ('22222222-2222-4222-8222-222222222222');

      alter default privileges in schema private
        grant select, insert, update, delete on tables to anon, authenticated, service_role;
    `);
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261120133500_external_project_asset_publication_proofs.sql',
          import.meta.url
        ),
        'utf8'
      )
    );

    const table = 'private.external_project_asset_publication_proofs';
    const insert = `insert into ${table} values (
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
      'fixture',
      '22222222-2222-4222-8222-222222222222',
      '2026-11-20T10:00:00Z',
      '2026-11-20T10:00:00Z',
      '{"asset":"2026-11-20T09:00:00Z"}'
    ) on conflict (id) do nothing`;
    await db.exec('set role authenticated');
    await assert.rejects(db.exec(insert), { code: '42501' });
    await assert.rejects(db.query(`select * from ${table}`), { code: '42501' });

    await db.exec('set role service_role');
    await db.exec(insert);
    await db.exec(insert);
    const result = await db.query(`select asset_revisions from ${table}`);
    assert.deepEqual(result.rows, [
      { asset_revisions: { asset: '2026-11-20T09:00:00Z' } },
    ]);
    await assert.rejects(
      db.exec(`update ${table} set asset_revisions = '{}'`),
      { code: '42501' }
    );
  } finally {
    await db.close();
  }
});

test('users cannot preserve an asset revision across deletion and replacement', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create role anon;
      create role authenticated;
      create table public.workspace_external_project_assets(id int primary key, updated_at timestamptz);
      create function public.tick() returns trigger language plpgsql as
        $$ begin new.updated_at := now(); return new; end; $$;
      create trigger workspace_external_project_assets_updated_at
        before update on public.workspace_external_project_assets for each row execute function public.tick();
      grant select, insert, update, delete on public.workspace_external_project_assets to authenticated;
    `);
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261120140000_stamp_external_project_asset_revisions.sql',
          import.meta.url
        ),
        'utf8'
      )
    );
    await db.exec('set role authenticated');
    const first = await db.query(
      "insert into public.workspace_external_project_assets values (1, '2000-01-01') returning updated_at::text as revision"
    );
    await db.exec(
      'delete from public.workspace_external_project_assets where id = 1'
    );
    const next = await db.query(
      'insert into public.workspace_external_project_assets values (1, $1) returning updated_at::text as revision',
      [first.rows[0].revision]
    );
    assert.notEqual(first.rows[0].revision, next.rows[0].revision);
    const updated = await db.query(
      'update public.workspace_external_project_assets set updated_at = $1 returning updated_at::text as revision',
      [first.rows[0].revision]
    );
    assert.notEqual(first.rows[0].revision, updated.rows[0].revision);
  } finally {
    await db.close();
  }
});
