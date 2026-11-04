import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const migrationName = '20261104123000_devbox_run_ownership.sql';
const migration = readFileSync(new URL(migrationName, migrations), 'utf8');
const live = readFileSync(
  new URL('20261026145300_reap_stale_devbox_runs.sql', migrations),
  'utf8'
);
const rollback = readFileSync(
  new URL(
    '../rollbacks/20261104123000_devbox_run_ownership.rollback.sql',
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

test('145300 body is unchanged outside ownership, Judge linkage, owner denial and search path', () => {
  const current = claim(migration);
  assert.ok(current);
  const judgeLink =
    '                and exists (select 1 from private.learn_coding_submissions submission where submission.run_id = run.id)\n';
  assert.equal(current.split(judgeLink).length - 1, 1);
  const ownerDenial =
    /\n {4}-- Fail closed for every workload[\s\S]*?reason=runner_owner_not_authorized[\s\S]*?\n {8}return;\n {4}end if;(?=\n {4}return query)/;
  assert.match(current, ownerDenial);
  const withoutOwnership = current
    .replace(judgeLink, '')
    .replace(
      'set search_path = pg_catalog, pg_temp',
      'set search_path = private, public, pg_temp'
    )
    .replace(
      'declare\n    v_owner_id uuid;\n    v_pool text;\nbegin\n',
      'begin\n'
    )
    .replace(ownerDenial, '')
    .replace(
      / {12}and run\.actor_id = lease\.actor_id[\s\S]*?(?= {12}-- A draining runner)/,
      ''
    );
  assert.equal(withoutOwnership, claim(live));
});

test('rollback restores exact live body (pg_catalog-pinned search path) with service-role-only execute', () => {
  const liveSearchPath = 'set search_path = private, public, pg_temp';
  assert.equal(claim(live).split(liveSearchPath).length - 1, 1);
  assert.equal(
    claim(rollback),
    claim(live).replace(
      liveSearchPath,
      'set search_path = pg_catalog, private, public, pg_temp'
    )
  );
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

test('the sweep is off the claim path and capped for Cron Control', () => {
  const current = claim(migration);
  assert.doesNotMatch(current, /cancel_unauthorized_devbox_runs/);
  const sweep = migration.match(
    /create or replace function private\.cancel_unauthorized_devbox_runs\([\s\S]*?\n\$\$;/i
  )?.[0];
  assert.ok(sweep);
  assert.match(sweep, /returns jsonb/);
  assert.match(sweep, /p_limit is null or p_limit < 1 or p_limit > 1000/);
  assert.match(sweep, /order by run\.created_at\n {8}limit p_limit/);
});
