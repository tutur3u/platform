const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { statements, identity, values } = require('./security-sql');

const sql = readFileSync(
  path.resolve(
    __dirname,
    '../../apps/database/supabase/migrations/20261101090000_bind_cross_app_handoff_pkce.sql'
  ),
  'utf8'
);
const parsed = statements(sql);
const acceptance = parsed.at(-1).find((token) => token.kind === 'body').value;

function assertBatchShape(source) {
  assert.doesNotMatch(source, /transaction\s*=\s*false/i);
  for (const statement of statements(source)) {
    const first = statement[0].value;
    assert.ok(
      ['set', 'lock', 'alter', 'create', 'revoke', 'grant', 'do'].includes(
        first
      ),
      `Unexpected batch statement: ${first}`
    );
    const code = values(statement.filter((token) => token.kind === 'word'));
    assert.doesNotMatch(
      code,
      /^(?:alter system|create (?:unique )?index concurrently)/
    );
    if (first === 'set') assert.match(code, /^set local /);
  }
}

test('PKCE migration keeps the CLI implicit batch and acquires its lock before DDL', () => {
  assertBatchShape(sql);
  assert.ok(
    sql.startsWith(
      "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n"
    )
  );
  assert.equal(
    values(parsed[2]),
    'lock table private . cross_app_tokens in access exclusive mode nowait'
  );
  assert.equal(parsed[3][0].value, 'alter');
  assert.equal(parsed.at(-1)[0].value, 'do');
});

test('batch shape rejects explicit boundaries and standalone commands', () => {
  for (const command of [
    'BEGIN;',
    'COMMIT;',
    'ROLLBACK;',
    'SAVEPOINT probe;',
    'VACUUM;',
    'CREATE INDEX CONCURRENTLY probe ON t(id);',
    'ALTER SYSTEM SET x = 1;',
    '-- transaction=false\n',
  ]) {
    assert.throws(() => assertBatchShape(command + sql));
  }
});

test('acceptance body hashes match every function authored in this file', () => {
  const expected = [
    ...acceptance.matchAll(/\('([^']+)','([a-f0-9]{64})'\)/g),
  ].map(([, signature, digest]) => [
    signature.replaceAll('integer', 'int4'),
    digest,
  ]);
  const actual = parsed
    .filter((ts) => values(ts.slice(0, 4)) === 'create or replace function')
    .map((ts) => [
      identity(ts, 4, true).signature,
      createHash('sha256')
        .update(ts.find((t) => t.kind === 'body').value)
        .digest('hex'),
    ]);
  assert.equal(actual.length, 4);
  assert.deepEqual(expected, actual);
  assert.match(acceptance, /IF n <> 4 THEN RAISE EXCEPTION/);
});

test('acceptance role matrix matches the file grants for all revoked roles', () => {
  const acl = new Map();
  for (const ts of parsed.filter((ts) =>
    ['revoke', 'grant'].includes(ts[0].value)
  )) {
    const id = identity(ts, ts.findIndex((t) => t.value === 'function') + 1);
    const roles = ts
      .slice(id.end + 1)
      .filter((t) => t.value !== ',')
      .map((t) => t.value);
    for (const role of roles)
      acl.set(`${id.signature}:${role}`, ts[0].value === 'grant');
  }
  const expected = new Map(
    [...acceptance.matchAll(/\('([^']+)','([^']+)',(true|false)\)/g)].map(
      ([, signature, role, allowed]) => [
        `${signature.replaceAll('integer', 'int4')}:${role}`,
        allowed === 'true',
      ]
    )
  );
  assert.equal(expected.size, 12);
  for (const [key, allowed] of acl) {
    if (key.endsWith(':public')) assert.equal(allowed, false);
    else assert.equal(expected.get(key), allowed, key);
  }
  assert.match(acceptance, /has_function_privilege/);
  assert.match(acceptance, /a.grantee=0 AND a.privilege_type='EXECUTE'/);
  assert.match(acceptance, /PKCE PUBLIC ACL acceptance failed/);
});

test('acceptance reads catalogs only and checks columns and replacement constraint', () => {
  assert.doesNotMatch(
    acceptance,
    /\b(?:from|join|update|into)\s+(?:private|public)\./i
  );
  for (const required of [
    'pg_catalog.pg_attribute',
    'pg_catalog.pg_constraint',
    'pg_catalog.pg_proc',
    "atttypid = 'text'::regtype",
    'NOT attnotnull',
    'NOT attisdropped',
    "conname = 'cross_app_tokens_code_challenge_check'",
    "contype = 'c' AND convalidated",
    'PKCE column acceptance failed',
    'PKCE constraint acceptance failed',
    'PKCE effective role ACL acceptance failed',
  ])
    assert.ok(acceptance.includes(required), required);
});
