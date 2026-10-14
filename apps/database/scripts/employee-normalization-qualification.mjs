import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactSourceSha } from './employee-schema-tap.mjs';

export const normalizationPacket = Object.freeze([
  'employee-inbound-mailbox-normalization.sql',
  20,
]);
export const normalizationMigration =
  'apps/database/supabase/migrations/20261014001000_normalize_employee_inbound_mailbox.sql';
export const normalizationPins = Object.freeze({
  migration: '9f7edf8ff87dc2e77ec5313961a8782261c4b93e4d073bed7bfa02e72492b142',
  fixture: '97149cfe92fbef535ef2c9d19a494cc77c4d096ded966db5213a456b4f3f1308',
});

export function verifyNormalizationInputs(migration, fixture) {
  for (const [kind, bytes] of Object.entries({ migration, fixture })) {
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      normalizationPins[kind]
    );
  }
  return migration.toString('utf8').match(/as \$\$([\s\S]*?)\$\$;/u)[1];
}

export const mailboxCatalogSQL = `select row_to_json(c) from (
select p.oid, pg_get_userbyid(p.proowner) as owner, p.proacl::text as acl,
p.prosecdef as security_definer, p.proconfig as config, p.prosrc as body,
pg_get_function_result(p.oid) as result, l.lanname as language,
pg_get_functiondef(p.oid) as definition,
has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
from pg_proc p join pg_language l on l.oid=p.prolang
where p.oid='private.employee_inbound_mailbox(text,uuid)'::regprocedure) c;`;

export function verifyMailboxCatalog(before, after, expectedBody) {
  for (const value of [before, after]) {
    assert.equal(value.security_definer, true);
    assert.deepEqual(value.config, ['search_path=""']);
    assert.equal(value.result, 'jsonb');
    assert.equal(value.language, 'plpgsql');
    assert.equal(typeof value.owner, 'string');
    assert.ok(value.owner.length > 0);
    assert.equal(value.anon_execute, false);
    assert.equal(value.authenticated_execute, false);
    assert.equal(value.public_execute, false);
    assert.equal(value.service_execute, true);
  }
  const attributes = ({ body: _body, definition: _definition, ...rest }) =>
    rest;
  assert.deepEqual(attributes(after), attributes(before));
  assert.equal(after.body, expectedBody);
  assert.notEqual(before.body, after.body);
  return true;
}

export function normalizationReceipt({
  sourceSha,
  controlSha,
  packets,
  lifecycleCode,
  cleanupSucceeded,
  catalogVerified,
  catalog,
  fixtureHashes,
}) {
  const expected = [{ file: normalizationPacket[0], assertions: 20 }];
  return {
    version: 1,
    sourceSha: exactSourceSha(sourceSha),
    controlSha: exactSourceSha(controlSha),
    scope: 'employee-inbound-mailbox-normalization',
    normalizationQualified:
      lifecycleCode === 0 &&
      cleanupSucceeded === true &&
      catalogVerified === true &&
      JSON.stringify(packets) === JSON.stringify(expected),
    schemaQualified: false,
    foundation172Qualified: false,
    assertions: packets.reduce((sum, packet) => sum + packet.assertions, 0),
    packets,
    fixtureHashes,
    migrationSHA256: normalizationPins.migration,
    catalogVerified,
    catalog,
    lifecycleCode,
    cleanupSucceeded,
    providerQualified: false,
    productionApplied: false,
  };
}
