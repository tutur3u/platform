import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pgTapBootstrapSQL,
  prepareNormalizationTestDependency,
  testDependencyCatalogSQL,
  verifyTestDependencyEvidence,
} from './employee-normalization-test-dependency.mjs';
import { exactSourceSha } from './employee-schema-tap.mjs';

export {
  pgTapBootstrapSQL,
  prepareNormalizationTestDependency,
  testDependencyCatalogSQL,
  verifyTestDependencyEvidence,
};
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
const digest = (value) => createHash('sha256').update(value).digest('hex');
const boundedInteger = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const isSHA256 = (value) => /^[a-f0-9]{64}$/u.test(value);
const identifier = /^[a-z_][a-z0-9_$]{0,62}$/u;
const setupIdentities = new Map([
  ['00000000-0000-4000-8000-000000094501', 'setup-auth-row-1'],
  ['00000000-0000-4000-8000-000000094502', 'setup-auth-row-2'],
]);
export function normalizationSQLFailure(stderr) {
  const unknown = { fixtureLine: null, sqlState: null };
  if (typeof stderr !== 'string' || Buffer.byteLength(stderr, 'utf8') > 65536)
    return unknown;
  const matches = [
    ...stderr.matchAll(
      /^psql:\/tmp\/employee-schema-contract\.sql:(\d+): ERROR: +([0-9A-Z]{5})(?:: ([^\n]*))?\s*$/gmu
    ),
  ];
  if (matches.length !== 1) return unknown;
  const [, rawLine, sqlState, message] = matches[0];
  const fixtureLine = Number(rawLine);
  if (
    !Number.isSafeInteger(fixtureLine) ||
    fixtureLine < 1 ||
    fixtureLine > 700
  )
    return unknown;
  if (message === undefined) return { fixtureLine, sqlState };
  const field = (name) => {
    const found = [
      ...stderr.matchAll(new RegExp(`^${name}: +([^\\n]*)$`, 'gmu')),
    ];
    return found.length === 1 ? found[0][1] : null;
  };
  const schema = field('SCHEMA NAME');
  const trustedSchema = ['auth', 'public', 'private'].includes(schema)
    ? schema
    : null;
  const name = (label) => {
    const value = field(label);
    return trustedSchema && value && identifier.test(value) ? value : null;
  };
  const detail = field('DETAIL');
  const context = field('CONTEXT');
  const functionMatch = context?.match(
    /^PL\/pgSQL function ((?:auth|public|private)\.[a-z_][a-z0-9_$]{0,62})\([^)]*\) line ([1-9][0-9]{0,5}) at [A-Z ]+$/u
  );
  const rows = [...setupIdentities]
    .filter(([id]) => detail?.toLowerCase().includes(id))
    .map(([, label]) => label);
  return {
    fixtureLine,
    sqlState,
    schema: trustedSchema,
    table: name('TABLE NAME'),
    constraint: name('CONSTRAINT NAME'),
    contextFunction: functionMatch?.[1] ?? null,
    contextLine: functionMatch ? Number(functionMatch[2]) : null,
    setupRow:
      fixtureLine === 16 &&
      trustedSchema === 'auth' &&
      name('TABLE NAME') === 'users' &&
      detail?.startsWith('Failing row contains (') &&
      rows.length === 1
        ? rows[0]
        : null,
    textEvidence: {
      messageSHA256: digest(message),
      detailSHA256: detail === null ? null : digest(detail),
      contextSHA256: context === null ? null : digest(context),
    },
  };
}
// Only identifiers from this owned isolated database can leave the raw boundary.
export const normalizationDiagnosticCatalogSQL = `SELECT json_build_object('actor', current_user, 'database', current_database(),
  'rows', coalesce(json_agg(json_build_object('schema', n.nspname,
  'table', t.relname, 'constraint', c.conname)
  ORDER BY n.nspname, t.relname, c.conname), '[]'::json))::text
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname IN ('auth','public','private');`;
const catalogEvidenceFields =
  'version shape count predicate index field identifierClass actor actorObserved database databaseObserved querySHA256 inputSHA256'.split(
    ' '
  );
const catalogPredicates =
  'VALID ARRAY_REQUIRED COUNT_LIMIT ROW_OBJECT_REQUIRED SCHEMA_NOT_ALLOWED TABLE_IDENTIFIER_REJECTED CONSTRAINT_IDENTIFIER_REJECTED'.split(
    ' '
  );
export function catalogValidationEvidence(value) {
  const rows = value?.rows;
  const problem = (row) =>
    !row || typeof row !== 'object' || Array.isArray(row)
      ? 'row'
      : !['auth', 'public', 'private'].includes(row.schema)
        ? 'schema'
        : typeof row.table !== 'string' || !identifier.test(row.table)
          ? 'table'
          : typeof row.constraint !== 'string' ||
              !identifier.test(row.constraint)
            ? 'constraint'
            : null;
  const predicate = !Array.isArray(rows)
    ? 'ARRAY_REQUIRED'
    : rows.length > 2048
      ? 'COUNT_LIMIT'
      : 'VALID';
  const index =
    predicate === 'VALID' ? rows.findIndex((row) => problem(row) !== null) : -1;
  const field = index < 0 ? null : problem(rows[index]);
  return {
    version: 1,
    shape: rows === null ? 'null' : Array.isArray(rows) ? 'array' : typeof rows,
    count: Array.isArray(rows) ? rows.length : null,
    predicate: field
      ? {
          row: 'ROW_OBJECT_REQUIRED',
          schema: 'SCHEMA_NOT_ALLOWED',
          table: 'TABLE_IDENTIFIER_REJECTED',
          constraint: 'CONSTRAINT_IDENTIFIER_REJECTED',
        }[field]
      : predicate,
    index: index < 0 ? null : index,
    field,
    identifierClass: ['table', 'constraint'].includes(field)
      ? typeof rows[index][field] === 'string'
        ? 'GRAMMAR_REJECTED'
        : 'NON_STRING'
      : null,
    actor: value?.actor === 'supabase_admin' ? 'supabase_admin' : null,
    actorObserved: typeof value?.actor === 'string',
    database: value?.database === 'postgres' ? 'postgres' : null,
    databaseObserved: typeof value?.database === 'string',
    querySHA256: digest(normalizationDiagnosticCatalogSQL),
    inputSHA256: digest(JSON.stringify(value ?? null)),
  };
}
const diagnosticFields =
  'status reason fixtureLine sqlState schema table constraint row origin catalogSHA256'.split(
    ' '
  );
const diagnosticReasons =
  'READABLE_CONSTRAINT_AND_ROW ROW_UNKNOWN FORMAT_UNKNOWN CATALOG_UNAVAILABLE IDENTITY_UNKNOWN'.split(
    ' '
  );
export function projectNormalizationDiagnostic(stderr, catalog) {
  const result = {
    status: 'UNKNOWN',
    reason: 'FORMAT_UNKNOWN',
    fixtureLine: null,
    sqlState: null,
    schema: null,
    table: null,
    constraint: null,
    row: null,
    origin: null,
    catalogSHA256: null,
  };
  if (
    typeof stderr !== 'string' ||
    Buffer.byteLength(stderr) > 65536 ||
    Array.from(stderr).some((character) => {
      const code = character.codePointAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    return result;
  const errors = [
    ...stderr.matchAll(
      /^psql:\/tmp\/employee-schema-contract\.sql:(\d+): ERROR: +([0-9A-Z]{5}): ([^\r\n]*)\r?$/gmu
    ),
  ];
  if (errors.length !== 1) return result;
  const [, line, state, message] = errors[0];
  const number = Number(line);
  if (!Number.isSafeInteger(number) || number < 1 || number > 700)
    return result;
  result.fixtureLine = number;
  result.sqlState = state;
  if (catalogValidationEvidence({ rows: catalog }).predicate !== 'VALID') {
    result.reason = 'CATALOG_UNAVAILABLE';
    return result;
  }
  result.catalogSHA256 = digest(JSON.stringify(catalog));
  const field = (label) => {
    const values = [
      ...stderr.matchAll(
        new RegExp(`^[ \\t]*${label}:[ \\t]*([^\\r\\n]*)\\r?$`, 'gmu')
      ),
    ];
    return values.length === 1 ? values[0][1] : null;
  };
  const schema = field('SCHEMA NAME'),
    table = field('TABLE NAME');
  const constraint = field('CONSTRAINT NAME');
  const standard = message.match(
    /^new row for relation "([a-z_][a-z0-9_$]{0,62})" violates check constraint "([a-z_][a-z0-9_$]{0,62})"$/u
  );
  const hasVerbose = schema !== null || table !== null || constraint !== null;
  const candidates = catalog.filter((x) =>
    hasVerbose
      ? x.schema === schema &&
        x.table === table &&
        x.constraint === constraint &&
        (!standard || (standard[1] === table && standard[2] === constraint))
      : standard && x.table === standard[1] && x.constraint === standard[2]
  );
  if (candidates.length !== 1) {
    result.reason = 'IDENTITY_UNKNOWN';
    return result;
  }
  const chosen = candidates[0];
  result.schema = chosen.schema;
  result.table = chosen.table;
  result.constraint = chosen.constraint;
  result.origin = hasVerbose ? 'verbose-fields' : 'standard-message';
  const detail = field('DETAIL');
  const rows = [...setupIdentities].filter(([id]) =>
    detail?.toLowerCase().includes(id)
  );
  if (
    number === 16 &&
    chosen.schema === 'auth' &&
    chosen.table === 'users' &&
    detail?.startsWith('Failing row contains (') &&
    rows.length === 1
  )
    result.row = rows[0][1];
  result.status = result.row === null ? 'PARTIAL' : 'COMPLETE';
  result.reason =
    result.row === null ? 'ROW_UNKNOWN' : 'READABLE_CONSTRAINT_AND_ROW';
  return result;
}
export function normalizationDiagnosticEnvelope(
  projection,
  sourceSha,
  controlSha
) {
  return {
    version: 1,
    sourceSha: exactSourceSha(sourceSha),
    controlSha: exactSourceSha(controlSha),
    phase: 'packet-execution-diagnostic',
    projection,
    projectionSHA256: digest(JSON.stringify(projection)),
    projectionBytes: Buffer.byteLength(JSON.stringify(projection)),
  };
}
export function validateNormalizationDiagnosticArtifact(bytes) {
  try {
    if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error();
    const receipt = JSON.parse(String(bytes));
    const rootKeys =
      'version sourceSha controlSha scope normalizationQualified schemaQualified foundation172Qualified assertions packets fixtureHashes migrationSHA256 catalogVerified catalog testDependency testDependencyPhase testDependencyVerified lifecycleCode cleanupSucceeded providerQualified productionApplied failureDiagnostic diagnosticTransport catalogValidation'.split(
        ' '
      );
    if (Object.keys(receipt).some((key) => !rootKeys.includes(key)))
      throw new Error();
    const forbidden = new Set(
      'stdout stderr message detail context raw rawBody rawMessage rawDetail rawContext failingRow error'.split(
        ' '
      )
    );
    const check = (value) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (forbidden.has(key)) throw new Error();
        check(item);
      }
    };
    check(receipt);
    const selection = receipt.failureDiagnostic?.catalogSelection;
    if (selection !== undefined) {
      const { reason, total, returned, complete } = selection;
      assert.deepEqual(
        Object.keys(selection).sort(),
        'version reason total returned complete selectorSHA256 querySHA256 rowsSHA256'
          .split(' ')
          .sort()
      );
      assert.equal(selection.version, 1);
      assert(
        'SELECTOR_UNAVAILABLE QUERY_ERROR RESPONSE_INVALID COUNT_LIMIT COMPLETE'
          .split(' ')
          .includes(reason)
      );
      assert(
        [total, returned].every(
          (n) => n === null || boundedInteger(n, 0, 10000000)
        )
      );
      assert(
        [
          selection.selectorSHA256,
          selection.querySHA256,
          selection.rowsSHA256,
        ].every((s) => s === null || isSHA256(s))
      );
      assert.equal(complete, reason === 'COMPLETE');
      assert(
        complete
          ? total !== null &&
              total <= 2048 &&
              returned === total &&
              selection.rowsSHA256 !== null
          : returned === 0 && selection.rowsSHA256 === null
      );
      assert(reason !== 'COUNT_LIMIT' || total > 2048);
    }

    exactSourceSha(receipt.sourceSha);
    exactSourceSha(receipt.controlSha);
    const c = receipt.catalogValidation;
    if (c !== undefined) {
      const { shape, count, index, field, predicate } = c;
      if (
        !c ||
        Object.keys(c).sort().join() !==
          [...catalogEvidenceFields].sort().join() ||
        c.version !== 1 ||
        (shape === 'array') !== (count !== null) ||
        !catalogPredicates.includes(predicate) ||
        !'array object null undefined string number boolean'
          .split(' ')
          .includes(shape) ||
        (count !== null && !boundedInteger(count, 0)) ||
        (index !== null && !boundedInteger(index, 0, count - 1)) ||
        ![null, 'row', 'schema', 'table', 'constraint'].includes(field) ||
        ![null, 'NON_STRING', 'GRAMMAR_REJECTED'].includes(c.identifierClass) ||
        ![null, 'supabase_admin'].includes(c.actor) ||
        typeof c.actorObserved !== 'boolean' ||
        ![null, 'postgres'].includes(c.database) ||
        typeof c.databaseObserved !== 'boolean' ||
        (c.actor !== null && !c.actorObserved) ||
        (c.database !== null && !c.databaseObserved) ||
        c.querySHA256 !== digest(normalizationDiagnosticCatalogSQL) ||
        !isSHA256(c.inputSHA256)
      )
        throw new Error();
      const boundedArray = shape === 'array' && count <= 2048;
      const noRow = index === null && field === null;
      const fields = {
        ROW_OBJECT_REQUIRED: 'row',
        SCHEMA_NOT_ALLOWED: 'schema',
        TABLE_IDENTIFIER_REJECTED: 'table',
        CONSTRAINT_IDENTIFIER_REJECTED: 'constraint',
      };
      if (
        (predicate === 'VALID' &&
          (!boundedArray || !noRow || c.identifierClass !== null)) ||
        (predicate === 'ARRAY_REQUIRED' && (shape === 'array' || !noRow)) ||
        (predicate === 'COUNT_LIMIT' &&
          (shape !== 'array' || count <= 2048 || !noRow)) ||
        (fields[predicate] &&
          (!boundedArray || index === null || field !== fields[predicate])) ||
        ['table', 'constraint'].includes(field) !== (c.identifierClass !== null)
      )
        throw new Error();
    }
    if (receipt.normalizationQualified === true && !receipt.failureDiagnostic)
      return { status: 'NOT_REQUIRED' };
    const e = receipt.diagnosticTransport,
      p = e?.projection;
    if (
      e?.version !== 1 ||
      e.sourceSha !== receipt.sourceSha ||
      e.controlSha !== receipt.controlSha ||
      e.phase !== 'packet-execution-diagnostic' ||
      Object.keys(e).sort().join() !==
        'version sourceSha controlSha phase projection projectionSHA256 projectionBytes'
          .split(' ')
          .sort()
          .join() ||
      !p ||
      Object.keys(p).sort().join() !== [...diagnosticFields].sort().join() ||
      !['UNKNOWN', 'PARTIAL', 'COMPLETE'].includes(p.status) ||
      !diagnosticReasons.includes(p.reason) ||
      e.projectionSHA256 !== digest(JSON.stringify(p)) ||
      e.projectionBytes !== Buffer.byteLength(JSON.stringify(p)) ||
      (p.fixtureLine !== null && !boundedInteger(p.fixtureLine, 1, 700)) ||
      (p.sqlState !== null && !/^[0-9A-Z]{5}$/u.test(p.sqlState)) ||
      (p.catalogSHA256 !== null && !isSHA256(p.catalogSHA256)) ||
      (p.row !== null && ![...setupIdentities.values()].includes(p.row))
    )
      throw new Error();
    if (p.status === 'UNKNOWN') {
      if (
        ['schema', 'table', 'constraint', 'row', 'origin'].some(
          (key) => p[key] !== null
        ) ||
        !['FORMAT_UNKNOWN', 'CATALOG_UNAVAILABLE', 'IDENTITY_UNKNOWN'].includes(
          p.reason
        )
      )
        throw new Error();
    } else if (
      !['auth', 'public', 'private'].includes(p.schema) ||
      !identifier.test(p.table) ||
      !identifier.test(p.constraint) ||
      !['verbose-fields', 'standard-message'].includes(p.origin) ||
      p.catalogSHA256 === null ||
      (p.status === 'COMPLETE'
        ? p.row === null || p.reason !== 'READABLE_CONSTRAINT_AND_ROW'
        : p.row !== null || p.reason !== 'ROW_UNKNOWN')
    )
      throw new Error();
    return { status: p.status };
  } catch {
    throw new Error('Diagnostic transport invalid');
  }
}
export function retainNormalizationFailure(result, context) {
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const evidence = {
    retained: false,
    stdoutBytes: Buffer.byteLength(stdout),
    stdoutSHA256: digest(stdout),
    stderrBytes: Buffer.byteLength(stderr),
    stderrSHA256: digest(stderr),
  };
  const safe = () => ({
    ...normalizationSQLFailure(stderr),
    privateEvidence: evidence,
  });
  try {
    const sourceSha = exactSourceSha(context.sourceSha);
    const controlSha = exactSourceSha(context.controlSha);
    if (
      context.phase !== 'packet-execution' ||
      context.packetOrdinal !== 1 ||
      evidence.stdoutBytes + evidence.stderrBytes > 1024 * 1024 ||
      typeof result.stdout !== 'string' ||
      typeof result.stderr !== 'string'
    )
      return safe();
    try {
      mkdirSync(context.directory, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') return safe();
    }
    const directory = lstatSync(context.directory);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (directory.mode & 0o777) !== 0o700 ||
      directory.uid !== process.getuid()
    )
      return safe();
    const bytes = `${JSON.stringify({
      sourceSha,
      controlSha,
      phase: context.phase,
      packetOrdinal: 1,
      clientBefore:
        typeof context.clientBefore === 'string' ? context.clientBefore : null,
      clientAfter:
        typeof context.clientAfter === 'string' ? context.clientAfter : null,
      status: Number.isInteger(result.status) ? result.status : null,
      signaled: Boolean(result.signal),
      processError: Boolean(result.error),
      stdout,
      stderr,
    })}\n`;
    const file = join(context.directory, 'failure.json');
    writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    const stored = readFileSync(file);
    if (digest(stored) !== digest(bytes)) return safe();
    evidence.retained = true;
    evidence.rawSHA256 = digest(stored);
    evidence.rawBytes = stored.length;
  } catch {
    // Safe artifact records unavailability; raw errors never leave this boundary.
  }
  return safe();
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
