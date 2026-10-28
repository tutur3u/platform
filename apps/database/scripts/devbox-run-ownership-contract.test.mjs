import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const migrationName = '20261027152100_devbox_run_ownership.sql';
const migration = readFileSync(new URL(migrationName, migrations), 'utf8');
const live = readFileSync(
  new URL('20261026145300_reap_stale_devbox_runs.sql', migrations),
  'utf8'
);
const rollback = readFileSync(
  new URL(
    '../rollbacks/20261027152100_devbox_run_ownership.rollback.sql',
    import.meta.url
  ),
  'utf8'
);
const claim = (sql) =>
  sql.match(
    /create or replace function private\.claim_next_devbox_run\([\s\S]*?\n\$\$;/i
  )?.[0];

test('ownership edits the latest claim definition', () => {
  const definitions = readdirSync(migrations)
    .sort()
    .filter((name) =>
      /create or replace function private\.claim_next_devbox_run\(/i.test(
        readFileSync(new URL(name, migrations), 'utf8')
      )
    );
  assert.equal(
    definitions.at(-1),
    migrationName,
    `Update the live claim base before editing ${fileURLToPath(migrations)}`
  );
});

test('145300 body is unchanged outside ownership predicates, cancellation and search path', () => {
  const current = claim(migration);
  assert.ok(current);
  const withoutOwnership = current
    .replace(
      'set search_path = pg_catalog, pg_temp',
      'set search_path = private, public, pg_temp'
    )
    .replace('    perform private.cancel_unauthorized_devbox_runs(25);\n', '')
    .replace(
      / {12}and run\.actor_id = lease\.actor_id[\s\S]*?(?= {12}-- A draining runner)/,
      ''
    );
  assert.equal(withoutOwnership, claim(live));
});

test('rollback restores exact live body with service-role-only execute', () => {
  assert.equal(claim(rollback), claim(live));
  for (const sql of [migration, rollback]) {
    assert.match(
      sql,
      /revoke all on function private\.claim_next_devbox_run\(uuid\) from public, anon, authenticated;/i
    );
    assert.match(
      sql,
      /grant execute on function private\.claim_next_devbox_run\(uuid\) to service_role;/i
    );
    assert.doesNotMatch(sql, /grant\s+[^;]+\s+to\s+(public|anon)\b/i);
  }
});
