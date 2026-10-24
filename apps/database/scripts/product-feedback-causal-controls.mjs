import { createHash } from 'node:crypto';
import { assertPacketTap } from './employee-schema-tap.mjs';

export const causalPins = Object.freeze({
  positiveSourceSha: '7d94127d0e6eb6c6e4024eeae8f136cd6fbdc0e0',
  migration:
    'apps/database/supabase/migrations/20261018010001_product_feedback_staff_inbox.sql',
  migrationSha256:
    '782606c4ce7ad10dcd2d245dec83ea9b0348af16ea049b2fc87425544d3d2218',
  functionSha256:
    '6ad0289be296259d081e24c1a17351b3695fe812eac7e3d7d5fa4a90f62e3e8e',
  fixture:
    'apps/database/supabase/tests/product-feedback-staff-eligibility.sql',
  fixtureSha256:
    '4be384c033d332f45a578dba1b0d511b2dda7369e847e0d4a57c25f778a845da',
});
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
const denied = () => new Error('Feedback causal contract denied');
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const mutations = freeze([
  [
    'service-role',
    "  IF auth.role() IS DISTINCT FROM 'service_role' THEN\n    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Service role required';\n  END IF;\n",
    '',
    [27],
  ],
  ['actor-binding', 'WHERE u.id=p_actor AND ', 'WHERE ', [15, 16, 17]],
  ['staff-email', ' AND e.staff_email=pg_catalog.lower(u.email)', '', [20]],
  ['active-lifecycle', "\n      AND e.lifecycle_state='active'", '', [18, 19]],
  ['confirmed-email', '\n      AND u.email_confirmed_at IS NOT NULL', '', [22]],
  [
    'ban',
    '\n      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())',
    '',
    [21],
  ],
  [
    'boolean-marker',
    "\n      AND u.raw_app_meta_data->'employee_onboarding'='true'::jsonb",
    '',
    [23, 24, 25, 26],
  ],
  [
    'registry-correlation',
    'JOIN private.infrastructure_employees e ON e.user_id=u.id',
    'JOIN private.infrastructure_employees e ON true',
    [31],
  ],
]);
export function selectFeedbackCausal(value, feedback) {
  if (
    ![undefined, 'false', 'true'].includes(value) ||
    typeof feedback !== 'boolean'
  )
    throw denied();
  if (value === 'true' && !feedback) throw denied();
  return value === 'true';
}
export function buildCausalInventory(migration, fixture) {
  if (
    digest(migration) !== causalPins.migrationSha256 ||
    digest(fixture) !== causalPins.fixtureSha256
  )
    throw denied();
  const start = migration.indexOf(
    'CREATE FUNCTION private.assert_product_feedback_staff('
  );
  const end = migration.indexOf('\n$$;', start);
  if (start < 0 || end < 0) throw denied();
  const original = migration.slice(start, end + 4);
  if (digest(original) !== causalPins.functionSha256) throw denied();
  const body = original.slice(original.indexOf('AS $$') + 5, -3);
  const variants = mutations.map(
    ([id, needle, replacement, failedOrdinals]) => {
      if (original.split(needle).length !== 2) throw denied();
      const definition = original
        .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
        .replace(needle, replacement);
      const sql = fixture.replace('BEGIN;\n', () => `BEGIN;\n${definition}\n`);
      return {
        id,
        failedOrdinals,
        definitionSha256: digest(definition),
        sqlSha256: digest(sql),
        sql,
      };
    }
  );
  const bindings = variants.map((variant) => ({
    id: variant.id,
    failedOrdinals: variant.failedOrdinals,
    definitionSha256: variant.definitionSha256,
    sqlSha256: variant.sqlSha256,
  }));
  return freeze({
    bodySha256: digest(body),
    fixture,
    variants,
    bindings,
    sha256: digest(JSON.stringify({ pins: causalPins, bindings })),
  });
}
function commandOutput(result) {
  if (
    result?.status !== 0 ||
    result.error != null ||
    result.signal != null ||
    result.timedOut ||
    typeof result.stdout !== 'string' ||
    Buffer.byteLength(result.stdout) > 1024 * 1024 ||
    Buffer.byteLength(result.stderr ?? '') > 1024 * 1024 ||
    /(?:ERROR|FATAL|PANIC):/iu.test(result.stderr ?? '')
  )
    throw denied();
  return result.stdout;
}
// pgTAP throws_ok's no-exception branch emits SQLSTATE only (not errmsg).
// Fixed descriptions bind diagnostics to the hash-pinned fixture denial contract.
const redDenials = Object.freeze({
  15: 'missing registry denies',
  16: 'null actor denies',
  17: 'absent actor denies',
  18: 'pending denies',
  19: 'provisioned denies',
  20: 'current email tuple mismatch denies',
  21: 'ban denies next call',
  22: 'unverified denies',
  23: 'false marker denies',
  24: 'null marker denies',
  25: 'string marker denies',
  26: 'missing marker denies',
  27: 'helper checks current role claims',
  31: 'matching email cannot substitute another registry identity',
});
export function assertExpectedRed(result, expected) {
  const tap = commandOutput(result);
  if (
    !Array.isArray(expected) ||
    !expected.length ||
    expected.some(
      (n, i) =>
        !Number.isInteger(n) ||
        !Object.hasOwn(redDenials, n) ||
        n <= (expected[i - 1] ?? 0)
    )
  )
    throw denied();
  const lines = tap.trim().split(/\r?\n/u);
  const plans = lines.filter((line) => /^1\.\./u.test(line));
  const transactions = lines.filter((line) =>
    /^(BEGIN|COMMIT|ROLLBACK|ABORT|END)$/u.test(line)
  );
  const assertions = lines.filter((line) => /^(?:not )?ok\b/u.test(line));
  if (
    plans.length !== 1 ||
    plans[0] !== '1..31' ||
    assertions.length !== 31 ||
    lines[0] !== 'BEGIN' ||
    lines.at(-1) !== 'ROLLBACK' ||
    JSON.stringify(transactions) !== '["BEGIN","ROLLBACK"]' ||
    /Bail out!|#\s*(SKIP|TODO)\b/iu.test(tap)
  )
    throw denied();
  const failed = [];
  const diagnostics = new Set();
  assertions.forEach((line, i) => {
    const match = /^(not )?ok ([1-9]\d*) - ([^#]+)$/u.exec(line);
    if (!match || Number(match[2]) !== i + 1) throw denied();
    if (!match[1]) return;
    const ordinal = i + 1;
    const description = redDenials[ordinal];
    if (!expected.includes(ordinal) || match[3] !== description) throw denied();
    const index = lines.indexOf(line);
    const block = [
      `# Failed test ${ordinal}: "${description}"`,
      '#       caught: no exception',
      `#       wanted: ${ordinal === 27 ? '42501' : 'PT403'}`,
    ];
    block.forEach((value, offset) => {
      const position = index + offset + 1;
      if (lines[position] !== value) throw denied();
      diagnostics.add(position);
    });
    failed.push(ordinal);
  });
  if (JSON.stringify(failed) !== JSON.stringify(expected)) throw denied();
  let summaries = 0;
  lines.forEach((line, index) => {
    if (diagnostics.has(index)) return;
    if (
      line ===
      `# Looks like you failed ${failed.length} test${failed.length === 1 ? '' : 's'} of 31`
    ) {
      if (++summaries > 1 || index < lines.lastIndexOf(assertions.at(-1)))
        throw denied();
      return;
    }
    if (/^#|caught:|wanted:|Failed test/iu.test(line)) throw denied();
  });
  return { assertions: 31, failedOrdinals: failed };
}
export function assertCausalGreen(result, count = 31) {
  return assertPacketTap(commandOutput(result), count);
}
export function causalDeadline(now = () => performance.now()) {
  const start = now();
  let previous = start;
  if (!Number.isFinite(start)) throw denied();
  return (cap = 60000) => {
    const current = now();
    if (
      !Number.isFinite(current) ||
      current < previous ||
      !Number.isSafeInteger(cap) ||
      cap < 1 ||
      cap > 1200000
    )
      throw denied();
    previous = current;
    const remaining = Math.floor(1200000 - (current - start));
    if (remaining <= 0) throw denied();
    return Math.min(cap, remaining);
  };
}
export const catalogSQL = `SELECT pg_catalog.jsonb_build_object(
 'definition',pg_catalog.pg_get_functiondef(p.oid),'body',p.prosrc,
 'owner',p.proowner::text,'acl',pg_catalog.to_jsonb(p.proacl),
 'settings',pg_catalog.to_jsonb(p.proconfig),'securityDefiner',p.prosecdef,
 'identity',p.oid::text,'language',l.lanname,
 'triggerEnabled',(SELECT t.tgenabled::text FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid='public.users'::regclass AND t.tgname='auto_create_personal_workspace_tr'
     AND NOT t.tgisinternal AND t.tgfoid='public.auto_create_personal_workspace()'::regprocedure)
 )::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid='private.assert_product_feedback_staff(uuid)'::regprocedure;`;
export const preflightSQL = `SELECT CASE WHEN
 NOT EXISTS(SELECT 1 FROM private.infrastructure_employees) AND
 NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN
 ('91800000-0000-4000-8000-000000000001','91800000-0000-4000-8000-000000000002'))
 THEN 'READY' ELSE 'DENY' END;`;
export function readCatalog(result, bodySha256) {
  const output = commandOutput(result).trim();
  if (Buffer.byteLength(output) > 65536) throw denied();
  let row;
  try {
    row = JSON.parse(output);
  } catch {
    throw denied();
  }
  const keys = [
    'definition',
    'body',
    'owner',
    'acl',
    'settings',
    'securityDefiner',
    'identity',
    'language',
    'triggerEnabled',
  ];
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    Object.keys(row).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(row, key)) ||
    typeof row.body !== 'string' ||
    digest(row.body) !== bodySha256 ||
    typeof row.definition !== 'string' ||
    !/^CREATE OR REPLACE FUNCTION private\.assert_product_feedback_staff\(p_actor uuid\)/u.test(
      row.definition
    ) ||
    typeof row.owner !== 'string' ||
    !/^[1-9]\d*$/u.test(row.owner) ||
    typeof row.identity !== 'string' ||
    !/^[1-9]\d*$/u.test(row.identity) ||
    row.securityDefiner !== true ||
    row.language !== 'plpgsql' ||
    row.triggerEnabled !== 'O' ||
    !Array.isArray(row.settings) ||
    JSON.stringify([...row.settings].sort()) !==
      JSON.stringify([
        'lock_timeout=500ms',
        'search_path=pg_catalog, pg_temp',
        'statement_timeout=3s',
      ]) ||
    !(
      row.acl === null ||
      (Array.isArray(row.acl) &&
        row.acl.every((entry) => typeof entry === 'string'))
    )
  )
    throw denied();
  return Object.fromEntries(keys.map((key) => [key, row[key]]));
}
export function assertCatalogRestored(baseline, observed) {
  if (JSON.stringify(baseline) !== JSON.stringify(observed)) throw denied();
  return digest(JSON.stringify(observed));
}
export function assertReady(result) {
  if (commandOutput(result).trim() !== 'READY') throw denied();
}
export function feedbackCausalReceipt({
  state,
  sourceSha,
  controlSha,
  schemaQualified,
  generatedTypesSha256,
  lifecycleCode,
  cleanupSucceeded,
}) {
  const observed = state?.observations ?? [];
  const bindings = state?.inventory?.bindings ?? [];
  const complete =
    bindings.length === 8 &&
    observed.length === 8 &&
    observed.every(
      (row, i) =>
        row.id === bindings[i].id &&
        row.sqlSha256 === bindings[i].sqlSha256 &&
        JSON.stringify(row.failedOrdinals) ===
          JSON.stringify(bindings[i].failedOrdinals) &&
        row.red === true &&
        row.catalogRestored === true &&
        row.green === true
    );
  const identity = [sourceSha, controlSha].every(
    (s) =>
      typeof s === 'string' && /^[a-f0-9]{40}$/u.test(s) && s !== '0'.repeat(40)
  );
  const restored =
    state?.baseline &&
    state.finalCatalogSha256 === digest(JSON.stringify(state.baseline));
  const finished =
    schemaQualified === true &&
    lifecycleCode === 0 &&
    cleanupSucceeded === true &&
    /^[a-f0-9]{64}$/u.test(generatedTypesSha256 ?? '');
  const qualified =
    identity && complete && restored && finished && state.phase === 'complete';
  return {
    version: 1,
    sourceSha,
    controlSha,
    phase: state?.phase ?? 'not-started',
    inventorySha256: state?.inventory?.sha256 ?? null,
    baselineCatalogSha256: state?.baseline
      ? digest(JSON.stringify(state.baseline))
      : null,
    finalCatalogSha256: state?.finalCatalogSha256 ?? null,
    causalQualified: Boolean(qualified),
    observations: observed.map(
      ({ id, sqlSha256, failedOrdinals, red, catalogRestored, green }) => ({
        id,
        sqlSha256,
        failedOrdinals,
        red,
        catalogRestored,
        green,
      })
    ),
    expectedRedPackets: 8,
    redAssertions: observed.filter((o) => o.red).length * 31,
    intermediateGreenAssertions:
      observed.filter((o, i) => i < 7 && o.green).length * 31,
    terminalGreenAssertions: schemaQualified ? 278 : 0,
    domainRegexp: 'structural-redundancy-not-mutated',
    aclAndRegistryAvailability: 'ordinary-denial-coverage-not-mutated',
    lifecycleCode,
    cleanupSucceeded,
  };
}
