const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'apps/database/supabase/migrations');
const RPC_SIGNATURE =
  'public.apply_hive_world_event(uuid, uuid, bigint, text, jsonb, jsonb)';
const HIVE_EVENT_PERSISTENCE_FILES = [
  'apps/hive/src/lib/hive/hive-db.ts',
  'apps/hive-realtime/src/hive-db.ts',
];

function readMigration(filename) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
}

function listHiveRpcDefinitions() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .sort()
    .filter((filename) => filename.endsWith('.sql'))
    .flatMap((filename) => {
      const sql = readMigration(filename);
      if (
        !sql.includes(
          'create or replace function public.apply_hive_world_event'
        )
      ) {
        return [];
      }

      return sql
        .split('create or replace function public.apply_hive_world_event')
        .slice(1)
        .map((definition) => ({
          filename,
          sql: `create or replace function public.apply_hive_world_event${
            definition.split(/\n\$\$;/u)[0]
          }\n$$;`,
        }));
    });
}

function latestHiveRpcDefinition() {
  const definitions = listHiveRpcDefinitions();

  assert.ok(definitions.length > 0, 'expected Hive world event RPC migrations');

  return definitions.at(-1);
}

function listHiveWorldEventInsertColumns(source) {
  return Array.from(
    source.matchAll(
      /insert\s+into\s+hive_world_events\s*\(([\s\S]*?)\)\s*values/giu
    )
  ).map((match) =>
    match[1]
      .split(',')
      .map((column) => column.trim().replace(/\s+/gu, ' '))
      .filter(Boolean)
  );
}

test('Hive world event RPC final definition binds writes to a verified actor', () => {
  const { filename, sql } = latestHiveRpcDefinition();

  assert.match(
    sql,
    /request_user_id uuid := auth\.uid\(\);/u,
    `${filename} must derive the request user from auth.uid()`
  );
  assert.match(
    sql,
    /request_role text := auth\.role\(\);/u,
    `${filename} must distinguish service-role mediation`
  );
  assert.match(
    sql,
    /hive_actor_mismatch/u,
    `${filename} must reject caller-supplied actor mismatches`
  );
  assert.doesNotMatch(
    sql,
    /is_hive_(?:member|platform_admin)\(p_actor_user_id\)/u,
    `${filename} must not authorize the raw caller-supplied actor`
  );
  assert.doesNotMatch(
    sql,
    /updated_by\s*=\s*p_actor_user_id\b/u,
    `${filename} must not write state attribution from the raw actor argument`
  );
  assert.doesNotMatch(
    sql,
    /values\s*\(\s*p_server_id,\s*0,\s*'\{\}'::jsonb,\s*p_actor_user_id\s*\)/u,
    `${filename} must not bootstrap state attribution from the raw actor argument`
  );
  assert.doesNotMatch(
    sql,
    /next_revision,\s*\n\s*p_actor_user_id,/u,
    `${filename} must not write event attribution from the raw actor argument`
  );
});

test('Hive world event RPC final migration revokes browser execution', () => {
  const grantPattern = new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+${RPC_SIGNATURE.replace(
      /[().]/g,
      '\\$&'
    )}\\s+to\\s+[^;]*(?:authenticated|anon|public)`,
    'iu'
  );
  const secureMigration = readMigration(
    '20260512204028_secure_hive_world_event_actor.sql'
  );

  assert.doesNotMatch(
    secureMigration,
    grantPattern,
    'final migration must not grant direct browser execution for the actor-accepting RPC'
  );
  assert.match(
    secureMigration,
    new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+${RPC_SIGNATURE.replace(
        /[().]/g,
        '\\$&'
      )}\\s+from\\s+public`,
      'iu'
    )
  );
  assert.match(
    secureMigration,
    new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+${RPC_SIGNATURE.replace(
        /[().]/g,
        '\\$&'
      )}\\s+from\\s+authenticated`,
      'iu'
    )
  );
  assert.match(
    secureMigration,
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+${RPC_SIGNATURE.replace(
        /[().]/g,
        '\\$&'
      )}\\s+to\\s+service_role`,
      'iu'
    )
  );
});

test('Hive event persistence does not duplicate full world snapshots into audit rows', () => {
  for (const relativePath of HIVE_EVENT_PERSISTENCE_FILES) {
    const source = fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
    const inserts = listHiveWorldEventInsertColumns(source);

    assert.ok(inserts.length > 0, `${relativePath} should append Hive events`);

    for (const columns of inserts) {
      assert.ok(
        !columns.includes('world_data'),
        `${relativePath} must keep full worlds in hive_world_states only`
      );
    }
  }
});
