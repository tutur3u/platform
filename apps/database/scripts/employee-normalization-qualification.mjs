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

const testAPIs = ['finish', 'is', 'plan'];
export const pgTapBootstrapSQL =
  'create extension if not exists pgtap with schema extensions;';
export const testDependencyCatalogSQL = `select row_to_json(c) from (
select current_user as actor, session_user as session_actor,
current_schemas(false) as search_path,
has_schema_privilege(current_user,'extensions','USAGE') as schema_usage,
(select default_version from pg_available_extensions where name='pgtap') as available_version,
(select array_agg(version order by version) from pg_available_extension_versions
 where name='pgtap') as available_versions,
e.oid::bigint as extension_oid, n.nspname as namespace,
e.extversion as installed_version, pg_get_userbyid(e.extowner) as owner,
to_regprocedure('extensions.plan(integer)')::oid::bigint as plan_oid,
to_regprocedure('plan(integer)')::oid::bigint as visible_plan_oid,
exists(select 1 from pg_depend d
 where d.classid='pg_proc'::regclass and d.refclassid='pg_extension'::regclass
 and d.deptype='e' and d.refobjid=e.oid
 and d.objid=to_regprocedure('extensions.plan(integer)')::oid) as plan_member,
case when to_regprocedure('extensions.plan(integer)') is null then false
 else has_function_privilege(current_user,to_regprocedure('extensions.plan(integer)')::oid,
 'EXECUTE') end as plan_execute,
(select json_agg(a order by a.name) from (
 select p.proname as name, count(*)::integer as function_count,
 count(*) filter (where has_function_privilege(current_user,p.oid,'EXECUTE'))::integer
 as executable_count from pg_proc p join pg_depend d on d.objid=p.oid
 and d.classid='pg_proc'::regclass and d.refclassid='pg_extension'::regclass
 and d.deptype='e' and d.refobjid=e.oid
 where p.pronamespace=e.extnamespace and p.proname in ('finish','is','plan')
 group by p.proname) a) as apis
from (select 1) seed left join pg_extension e on e.extname='pgtap'
left join pg_namespace n on n.oid=e.extnamespace) c;`;

function verifyDependencyActor(value) {
  assert.ok(value && typeof value === 'object');
  assert.equal(value.actor, 'supabase_admin');
  assert.equal(value.session_actor, 'supabase_admin');
  assert.deepEqual(value.search_path, ['public', 'extensions']);
  assert.equal(value.schema_usage, true);
  assert.equal(typeof value.available_version, 'string');
  assert.ok(value.available_version.length > 0);
  assert.ok(Array.isArray(value.available_versions));
  assert.ok(value.available_versions.includes(value.available_version));
}

function verifyInstalledDependency(value) {
  assert.ok(
    Number.isSafeInteger(value.extension_oid) && value.extension_oid > 0
  );
  assert.equal(value.namespace, 'extensions');
  assert.equal(typeof value.owner, 'string');
  assert.ok(value.owner.length > 0);
  assert.equal(typeof value.installed_version, 'string');
  assert.ok(value.available_versions.includes(value.installed_version));
  assert.ok(Number.isSafeInteger(value.plan_oid) && value.plan_oid > 0);
  assert.equal(value.visible_plan_oid, value.plan_oid);
  assert.equal(value.plan_member, true);
  assert.equal(value.plan_execute, true);
  assert.ok(Array.isArray(value.apis));
  for (const api of value.apis) {
    assert.ok(api && typeof api === 'object');
  }
  assert.deepEqual(
    value.apis.map((api) => api.name),
    testAPIs
  );
  for (const api of value.apis) {
    assert.ok(
      Number.isSafeInteger(api.function_count) && api.function_count > 0
    );
    assert.equal(api.executable_count, api.function_count);
  }
}

function verifyDependencyBefore(value) {
  verifyDependencyActor(value);
  if (value.extension_oid !== null) {
    verifyInstalledDependency(value);
    return;
  }
  for (const key of [
    'namespace',
    'installed_version',
    'owner',
    'plan_oid',
    'visible_plan_oid',
  ]) {
    assert.equal(value[key], null);
  }
  assert.equal(value.plan_member, false);
  assert.equal(value.plan_execute, false);
  assert.ok(
    value.apis === null ||
      (Array.isArray(value.apis) && value.apis.length === 0)
  );
}

export function verifyTestDependencyEvidence(evidence) {
  assert.ok(evidence && typeof evidence === 'object');
  verifyDependencyBefore(evidence.before);
  verifyDependencyActor(evidence.after);
  verifyInstalledDependency(evidence.after);
  assert.deepEqual(
    evidence.after.available_versions,
    evidence.before.available_versions
  );
  assert.equal(
    evidence.after.available_version,
    evidence.before.available_version
  );
  if (evidence.before.extension_oid === null) {
    assert.equal(
      evidence.after.installed_version,
      evidence.before.available_version
    );
  } else {
    for (const key of [
      'extension_oid',
      'namespace',
      'owner',
      'installed_version',
      'plan_oid',
    ]) {
      assert.equal(evidence.after[key], evidence.before[key]);
    }
  }
  return true;
}

export function prepareNormalizationTestDependency(
  executeSQL,
  recordEvidence = () => {}
) {
  const before = JSON.parse(
    executeSQL(testDependencyCatalogSQL, 'catalog-before')
  );
  recordEvidence({ before, after: null });
  verifyDependencyBefore(before);
  executeSQL(pgTapBootstrapSQL, 'bootstrap');
  const after = JSON.parse(
    executeSQL(testDependencyCatalogSQL, 'catalog-after')
  );
  const evidence = { before, after };
  recordEvidence(evidence);
  verifyTestDependencyEvidence(evidence);
  return evidence;
}

// psql VERBOSITY=sqlstate suppresses values, messages, details and SQL context.
export function normalizationSQLFailure(stderr) {
  const unknown = { fixtureLine: null, sqlState: null };
  if (typeof stderr !== 'string' || Buffer.byteLength(stderr, 'utf8') > 65536)
    return unknown;
  const matches = [
    ...stderr.matchAll(
      /^psql:\/tmp\/employee-schema-contract\.sql:(\d+): ERROR: +([0-9A-Z]{5})\s*$/gmu
    ),
  ];
  if (matches.length !== 1) return unknown;
  const line = Number(matches[0][1]);
  if (!Number.isSafeInteger(line) || line < 1 || line > 700) return unknown;
  return { fixtureLine: line, sqlState: matches[0][2] };
}

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
  testDependency,
  testDependencyPhase,
}) {
  const expected = [{ file: normalizationPacket[0], assertions: 20 }];
  let testDependencyVerified = false;
  try {
    testDependencyVerified =
      testDependencyPhase === 'verified' &&
      verifyTestDependencyEvidence(testDependency);
  } catch {
    // Preserve observed dependency evidence without qualifying a partial setup.
  }
  return {
    version: 1,
    sourceSha: exactSourceSha(sourceSha),
    controlSha: exactSourceSha(controlSha),
    scope: 'employee-inbound-mailbox-normalization',
    normalizationQualified:
      lifecycleCode === 0 &&
      cleanupSucceeded === true &&
      catalogVerified === true &&
      testDependencyVerified &&
      JSON.stringify(packets) === JSON.stringify(expected),
    schemaQualified: false,
    foundation172Qualified: false,
    assertions: packets.reduce((sum, packet) => sum + packet.assertions, 0),
    packets,
    fixtureHashes,
    migrationSHA256: normalizationPins.migration,
    catalogVerified,
    catalog,
    testDependency: testDependency ?? null,
    testDependencyPhase: testDependencyPhase ?? 'not-started',
    testDependencyVerified,
    lifecycleCode,
    cleanupSucceeded,
    providerQualified: false,
    productionApplied: false,
  };
}
