import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  normalizationPacket,
  normalizationReceipt,
  normalizationSQLFailure,
  pgTapBootstrapSQL,
  prepareNormalizationTestDependency,
  retainNormalizationFailure,
  testDependencyCatalogSQL,
  verifyMailboxCatalog,
  verifyNormalizationInputs,
} from './employee-normalization-qualification.mjs';

test('SQL fixture failure preserves only exact source line and SQLSTATE', () => {
  assert.deepEqual(
    normalizationSQLFailure(
      'psql:/tmp/employee-schema-contract.sql:27: ERROR:  23505\n'
    ),
    { fixtureLine: 27, sqlState: '23505' }
  );
  for (const value of [
    undefined,
    'private value',
    'psql:/tmp/other.sql:27: ERROR:  23505\n',
    'psql:/tmp/employee-schema-contract.sql:701: ERROR:  23505\n',
    'psql:/tmp/employee-schema-contract.sql:27: ERROR:  private-token\n',
    'psql:/tmp/employee-schema-contract.sql:27: ERROR:  23505\n'.repeat(2),
  ]) {
    assert.deepEqual(normalizationSQLFailure(value), {
      fixtureLine: null,
      sqlState: null,
    });
  }
});

import { assertPacketTap, foundationPackets } from './employee-schema-tap.mjs';

const before = {
  oid: 123,
  owner: 'postgres',
  acl: '{postgres=X/postgres,service_role=X/postgres}',
  security_definer: true,
  config: ['search_path=""'],
  body: 'old body',
  definition: 'old definition',
  result: 'jsonb',
  language: 'plpgsql',
  anon_execute: false,
  authenticated_execute: false,
  public_execute: false,
  service_execute: true,
};
const after = { ...before, body: 'new body', definition: 'new definition' };
const dependencyBefore = {
  actor: 'supabase_admin',
  session_actor: 'supabase_admin',
  search_path: ['public', 'extensions'],
  schema_usage: true,
  available_version: 'fixture-version',
  available_versions: ['fixture-version'],
  extension_oid: null,
  namespace: null,
  installed_version: null,
  owner: null,
  plan_oid: null,
  visible_plan_oid: null,
  plan_member: false,
  plan_execute: false,
  apis: null,
};
const dependencyAfter = {
  ...dependencyBefore,
  extension_oid: 700,
  namespace: 'extensions',
  installed_version: 'fixture-version',
  owner: 'supabase_admin',
  plan_oid: 701,
  visible_plan_oid: 701,
  plan_member: true,
  plan_execute: true,
  apis: ['finish', 'is', 'plan'].map((name) => ({
    name,
    function_count: 1,
    executable_count: 1,
  })),
};
const successful = {
  sourceSha: 'a'.repeat(40),
  controlSha: 'b'.repeat(40),
  packets: [{ file: normalizationPacket[0], assertions: 20 }],
  lifecycleCode: 0,
  cleanupSucceeded: true,
  catalogVerified: true,
  catalog: { before, after },
  fixtureHashes: [],
  testDependency: { before: dependencyBefore, after: dependencyAfter },
  testDependencyPhase: 'verified',
};

test('qualification rejects absent pgTAP dependency evidence before packet acceptance', () => {
  assert.equal(
    normalizationReceipt({ ...successful, testDependency: undefined })
      .normalizationQualified,
    false
  );
});

function dependencyDriver(
  beforeValue = dependencyBefore,
  afterValue = dependencyAfter
) {
  const calls = [];
  const executeSQL = (sql, phase) => {
    calls.push({ sql, phase });
    if (phase === 'catalog-before') return JSON.stringify(beforeValue);
    if (phase === 'bootstrap') return '';
    return JSON.stringify(afterValue);
  };
  return { calls, executeSQL };
}

test('dependency preparation precedes packet and retains actual catalog evidence', () => {
  const driver = dependencyDriver();
  const evidence = prepareNormalizationTestDependency(driver.executeSQL);
  driver.calls.push({ phase: 'packet' });
  assert.deepEqual(
    driver.calls.map((call) => call.phase),
    ['catalog-before', 'bootstrap', 'catalog-after', 'packet']
  );
  assert.equal(driver.calls[0].sql, testDependencyCatalogSQL);
  assert.equal(driver.calls[1].sql, pgTapBootstrapSQL);
  assert.deepEqual(evidence, {
    before: dependencyBefore,
    after: dependencyAfter,
  });
  assert.equal(
    normalizationReceipt({ ...successful, testDependency: evidence })
      .testDependencyVerified,
    true
  );
});

test('existing extension retains identity and version without relocation', () => {
  const driver = dependencyDriver(dependencyAfter, dependencyAfter);
  const evidence = prepareNormalizationTestDependency(driver.executeSQL);
  assert.equal(evidence.before.extension_oid, evidence.after.extension_oid);
  assert.equal(
    driver.calls[1].sql,
    'create extension if not exists pgtap with schema extensions;'
  );
});

test('unexpected database actor stops before bootstrap', () => {
  const driver = dependencyDriver({
    ...dependencyBefore,
    actor: 'authenticated',
  });
  assert.throws(() => prepareNormalizationTestDependency(driver.executeSQL), {
    name: 'AssertionError',
  });
  assert.equal(driver.calls.length, 1);
});

test('wrong installed extension namespace stops before bootstrap', () => {
  const driver = dependencyDriver({ ...dependencyAfter, namespace: 'public' });
  assert.throws(() => prepareNormalizationTestDependency(driver.executeSQL), {
    name: 'AssertionError',
  });
  assert.equal(driver.calls.length, 1);
});

test('unavailable pgTAP package stops before bootstrap', () => {
  const driver = dependencyDriver({
    ...dependencyBefore,
    available_version: null,
    available_versions: [],
  });
  assert.throws(() => prepareNormalizationTestDependency(driver.executeSQL), {
    name: 'AssertionError',
  });
  assert.equal(driver.calls.length, 1);
});

test('fixture search path shadow rejects the prepared dependency', () => {
  const driver = dependencyDriver(dependencyBefore, {
    ...dependencyAfter,
    visible_plan_oid: 999,
  });
  const observed = [];
  assert.throws(
    () =>
      prepareNormalizationTestDependency(driver.executeSQL, (evidence) =>
        observed.push(evidence)
      ),
    { name: 'AssertionError' }
  );
  assert.equal(driver.calls.at(-1).phase, 'catalog-after');
  assert.equal(observed[0].after, null);
  assert.equal(observed[1].after.visible_plan_oid, 999);
});

test('plan must belong to pgTAP rather than a substitute function', () => {
  const driver = dependencyDriver(dependencyBefore, {
    ...dependencyAfter,
    plan_member: false,
  });
  assert.throws(() => prepareNormalizationTestDependency(driver.executeSQL), {
    name: 'AssertionError',
  });
});

test('fixture APIs require execute privilege under the observed actor', () => {
  const driver = dependencyDriver(dependencyBefore, {
    ...dependencyAfter,
    apis: [
      { name: 'finish', function_count: 1, executable_count: 0 },
      ...dependencyAfter.apis.slice(1),
    ],
  });
  assert.throws(() => prepareNormalizationTestDependency(driver.executeSQL), {
    name: 'AssertionError',
  });
});

test('bootstrap transport failure stops before later catalog or packet', () => {
  const driver = dependencyDriver();
  const failure = new Error('fixture bootstrap transport unavailable');
  assert.throws(
    () =>
      prepareNormalizationTestDependency((sql, phase) => {
        if (phase === 'bootstrap') throw failure;
        return driver.executeSQL(sql, phase);
      }),
    (error) => error === failure
  );
  assert.deepEqual(
    driver.calls.map((call) => call.phase),
    ['catalog-before']
  );
});

test('receipt cannot qualify evidence from unfinished preparation', () => {
  const receipt = normalizationReceipt({
    ...successful,
    testDependencyPhase: 'catalog-after',
  });
  assert.equal(receipt.testDependencyVerified, false);
  assert.equal(receipt.normalizationQualified, false);
});

test('runner prepares and gates the actual direct-psql packet path', () => {
  const runner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  const call = runner.indexOf(
    'testDependency = prepareNormalizationTestDependency('
  );
  const verified = runner.indexOf("testDependencyPhase = 'verified'", call);
  const catalog = runner.indexOf('catalog.before =', verified);
  const packet = runner.indexOf('for (const [position', catalog);
  assert.ok(
    call > 0 && verified > call && catalog > verified && packet > catalog
  );
  assert.match(
    runner,
    /PGOPTIONS=-c search_path=public,extensions -c statement_timeout=10000 -c lock_timeout=3000/u
  );
  assert.match(testDependencyCatalogSQL, /d\.deptype='e'/u);
  assert.match(
    testDependencyCatalogSQL,
    /to_regprocedure\('plan\(integer\)'\)/u
  );
});

test('accepts changed body only while preserving identity and restricted execution', () => {
  assert.equal(verifyMailboxCatalog(before, after, 'new body'), true);
});
test('rejects owner, ACL, identity and signature drift', () => {
  for (const [key, value] of [
    ['owner', 'other'],
    ['acl', null],
    ['oid', 456],
    ['result', 'text'],
    ['language', 'sql'],
  ]) {
    assert.throws(() =>
      verifyMailboxCatalog(before, { ...after, [key]: value }, 'new body')
    );
  }
});
test('rejects security definer, search path and role privilege changes', () => {
  for (const [key, value] of [
    ['security_definer', false],
    ['config', ['search_path=public']],
    ['anon_execute', true],
    ['authenticated_execute', true],
    ['public_execute', true],
    ['service_execute', false],
  ]) {
    assert.throws(() =>
      verifyMailboxCatalog(before, { ...after, [key]: value }, 'new body')
    );
  }
});
test('rejects wrong or unchanged applied body and insecure baseline', () => {
  assert.throws(() => verifyMailboxCatalog(before, after, 'wrong'));
  assert.throws(() => verifyMailboxCatalog(before, before, before.body));
  assert.throws(() =>
    verifyMailboxCatalog({ ...before, public_execute: true }, after, after.body)
  );
});
test('wrong frozen migration or fixture fails before execution', () => {
  assert.throws(() =>
    verifyNormalizationInputs(Buffer.from('other'), Buffer.from('other'))
  );
});
test('20 packet receipt never certifies the 172 suite', () => {
  const value = normalizationReceipt(successful);
  assert.equal(value.normalizationQualified, true);
  assert.equal(value.assertions, 20);
  assert.equal(value.schemaQualified, false);
  assert.equal(value.foundation172Qualified, false);
  assert.equal(value.providerQualified, false);
  assert.equal(value.productionApplied, false);
  assert.equal(
    foundationPackets.reduce((sum, [, n]) => sum + n, 0),
    172
  );
});
test('missing catalog, cleanup, lifecycle or exact packet cannot qualify', () => {
  for (const delta of [
    { catalogVerified: false },
    { cleanupSucceeded: false },
    { lifecycleCode: 1 },
    { packets: [] },
    { packets: [{ file: normalizationPacket[0], assertions: 19 }] },
    {
      packets: foundationPackets.map(([file, assertions]) => ({
        file,
        assertions,
      })),
    },
  ]) {
    assert.equal(
      normalizationReceipt({ ...successful, ...delta }).normalizationQualified,
      false
    );
  }
});
test('normalization uses strict plan20, no skips, and observed rollback', () => {
  const tap = [
    'BEGIN',
    ...Array.from({ length: 20 }, (_, i) => `ok ${i + 1} - case`),
    '1..20',
    'ROLLBACK',
    '',
  ].join('\n');
  assert.equal(assertPacketTap(tap, 20), 20);
  for (const value of [
    tap.replace('ok 3', 'not ok 3'),
    tap.replace('1..20', '1..19'),
    tap.replace('ok 1 - case', 'ok 1 - case # SKIP'),
    tap.replace('ROLLBACK', 'COMMIT'),
  ]) {
    assert.throws(() => assertPacketTap(value, 20));
  }
});
test('runner stages the baseline without the additive migration, applies it then captures catalog', () => {
  const runner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    runner,
    /trackedFiles\.filter\(\(file\) => file !== normalizationMigration\)/u
  );
  assert.match(runner, /trackedFiles: stagedFiles/u);
  assert.ok(
    runner.indexOf('catalog.before =') <
      runner.indexOf("'-f', '/tmp/employee-normalization.sql'")
  );
  assert.ok(
    runner.indexOf("'-f', '/tmp/employee-normalization.sql'") <
      runner.indexOf('catalog.after =')
  );
  assert.ok(
    runner.indexOf('verifyMailboxCatalog(catalog.before') <
      runner.indexOf('for (const [position')
  );
});

const privateCheckDiagnostic =
  'psql:/tmp/employee-schema-contract.sql:16: ERROR:  23514: private-token fixture@example.com\nDETAIL: Failing row contains (00000000-0000-4000-8000-000000094501, private-token).\nCONTEXT: PL/pgSQL function private.fixture_guard() line 9 at RAISE\nSCHEMA NAME: auth\nTABLE NAME: users\nCONSTRAINT NAME: fixture_guard_check\n';
test('private-diagnostic retention captures named23514', () => {
  const diagnostic = normalizationSQLFailure(privateCheckDiagnostic);
  assert.equal(diagnostic.constraint, 'fixture_guard_check');
  assert.equal(diagnostic.fixtureLine, 16);
  assert.equal(diagnostic.sqlState, '23514');
});

const diagnosticHomes = [];
const diagnosticResult = {
  stdout: '1..20\n',
  stderr: privateCheckDiagnostic,
  status: 3,
  signal: null,
  error: undefined,
};
function diagnosticContext() {
  const home = fs.mkdtempSync(join(tmpdir(), 'employee-private-diagnostic-'));
  diagnosticHomes.push(home);
  return {
    directory: join(home, 'raw'),
    sourceSha: 'a'.repeat(40),
    controlSha: 'b'.repeat(40),
    phase: 'packet-execution',
    packetOrdinal: 1,
    clientBefore: '2026-10-14T00:00:00.000Z',
    clientAfter: '2026-10-14T00:00:00.001Z',
  };
}
test.afterEach(() => {
  test.mock.restoreAll();
  syncBuiltinESMExports();
  for (const home of diagnosticHomes.splice(0))
    fs.rmSync(home, { recursive: true, force: true });
});
test('private-diagnostic retention binds private result and phase', () => {
  const context = diagnosticContext();
  const result = retainNormalizationFailure(diagnosticResult, context);
  assert.equal(result.privateEvidence.retained, true);
  const raw = JSON.parse(readFileSync(join(context.directory, 'failure.json')));
  assert.equal(raw.sourceSha, context.sourceSha);
  assert.equal(raw.controlSha, context.controlSha);
  assert.equal(raw.phase, 'packet-execution');
  assert.equal(raw.packetOrdinal, 1);
  assert.equal(raw.clientBefore, context.clientBefore);
  assert.equal(raw.clientAfter, context.clientAfter);
  assert.equal(raw.status, 3);
  assert.equal(fs.statSync(context.directory).mode & 0o777, 0o700);
  assert.equal(
    fs.statSync(join(context.directory, 'failure.json')).mode & 0o777,
    0o600
  );
  assert.equal(
    retainNormalizationFailure(diagnosticResult, {
      ...context,
      phase: 'unknown',
    }).privateEvidence.retained,
    false
  );
});
test('private-diagnostic retention distinguishes synthetic row and unknown', () => {
  assert.equal(
    normalizationSQLFailure(privateCheckDiagnostic).setupRow,
    'setup-auth-row-1'
  );
  assert.equal(
    normalizationSQLFailure(
      privateCheckDiagnostic.replace(
        '00000000-0000-4000-8000-000000094501',
        '00000000-0000-4000-8000-000000099999'
      )
    ).setupRow,
    null
  );
  assert.equal(
    normalizationSQLFailure(
      privateCheckDiagnostic.replace(
        'private-token).',
        '00000000-0000-4000-8000-000000094502).'
      )
    ).setupRow,
    null
  );
});
test('private-diagnostic retention never projects raw values', () => {
  const safe = JSON.stringify(
    retainNormalizationFailure(diagnosticResult, diagnosticContext())
  );
  for (const secret of [
    'private-token',
    'fixture@example.com',
    '00000000-0000-4000-8000-000000094501',
    'Failing row contains',
    'at RAISE',
  ])
    assert.equal(safe.includes(secret), false);
  const parsed = JSON.parse(safe);
  assert.equal(parsed.contextFunction, 'private.fixture_guard');
  assert.equal(parsed.contextLine, 9);
  assert.match(parsed.textEvidence.detailSHA256, /^[a-f0-9]{64}$/u);
});
test('private-diagnostic retention malformed fields remain unknown', () => {
  assert.deepEqual(
    normalizationSQLFailure(
      'psql:/tmp/employee-schema-contract.sql:27: ERROR:  23505\n'
    ),
    { fixtureLine: 27, sqlState: '23505' }
  );
  assert.deepEqual(normalizationSQLFailure('private-token'), {
    fixtureLine: null,
    sqlState: null,
  });
  assert.equal(
    normalizationSQLFailure(privateCheckDiagnostic.repeat(2)).fixtureLine,
    null
  );
  const bad = normalizationSQLFailure(
    privateCheckDiagnostic
      .replace('SCHEMA NAME: auth', 'SCHEMA NAME: untrusted')
      .replace(
        'CONSTRAINT NAME: fixture_guard_check',
        'CONSTRAINT NAME: private-token@example.com'
      )
  );
  assert.equal(bad.schema, null);
  assert.equal(bad.table, null);
  assert.equal(bad.constraint, null);
});
test('private-diagnostic retention bounds oversized streams', () => {
  const result = retainNormalizationFailure(
    { ...diagnosticResult, stderr: 'x'.repeat(1024 * 1024 + 1) },
    diagnosticContext()
  );
  assert.equal(result.privateEvidence.retained, false);
  assert.equal(result.fixtureLine, null);
  assert.equal(result.privateEvidence.stderrBytes, 1024 * 1024 + 1);
  assert.match(result.privateEvidence.stderrSHA256, /^[a-f0-9]{64}$/u);
});
test('private-diagnostic retention write and read failures stay unavailable', () => {
  const first = diagnosticContext();
  const good = retainNormalizationFailure(diagnosticResult, first);
  assert.equal(good.privateEvidence.retained, true);
  assert.equal(
    retainNormalizationFailure(diagnosticResult, first).privateEvidence
      .retained,
    false
  );
  const second = diagnosticContext();
  test.mock.method(fs, 'readFileSync', () => {
    throw new Error('private-reader-fault');
  });
  syncBuiltinESMExports();
  const readFailure = retainNormalizationFailure(diagnosticResult, second);
  assert.equal(readFailure.privateEvidence.retained, false);
  assert.equal(
    JSON.stringify(readFailure).includes('private-reader-fault'),
    false
  );
  assert.equal(
    normalizationReceipt({ ...successful, lifecycleCode: 1 })
      .normalizationQualified,
    false
  );
});
test('private-diagnostic retention preserves signal and process failure truth', () => {
  const context = diagnosticContext();
  const safe = retainNormalizationFailure(
    {
      ...diagnosticResult,
      status: null,
      signal: 'SIGTERM',
      error: new Error('private-process-token'),
    },
    context
  );
  const raw = JSON.parse(readFileSync(join(context.directory, 'failure.json')));
  assert.equal(raw.signaled, true);
  assert.equal(raw.processError, true);
  assert.equal(raw.status, null);
  assert.equal(JSON.stringify(safe).includes('private-process-token'), false);
});
test('private-diagnostic retention success remains diagnostic free', () => {
  const receipt = normalizationReceipt(successful);
  assert.equal(receipt.normalizationQualified, true);
  assert.equal('failureDiagnostic' in receipt, false);
  assert.equal(receipt.schemaQualified, false);
  assert.equal(receipt.foundation172Qualified, false);
});
test('private-diagnostic retention cannot override qualification guards', () => {
  for (const changed of [
    { lifecycleCode: 1 },
    { cleanupSucceeded: false },
    { testDependencyPhase: 'not-started' },
    { catalogVerified: false },
    { packets: [] },
  ]) {
    const receipt = normalizationReceipt({
      ...successful,
      ...changed,
      failureDiagnostic: { constraint: 'fixture_guard_check' },
    });
    assert.equal(receipt.normalizationQualified, false);
    assert.equal(receipt.providerQualified, false);
    assert.equal(receipt.productionApplied, false);
  }
});
test('private-diagnostic retention preserves foundation mode selection', () => {
  const runner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    runner,
    /const selectedPackets = normalizationOnly\s*\? \[normalizationPacket\]\s*: foundationPackets;/u
  );
  assert.match(runner, /if \(normalizationOnly\) \{\s*const diagnostic/u);
});
test('private-diagnostic retention richer request only guards selected packet', () => {
  const runner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.ok(
    runner.includes("...(normalizationOnly ? ['-v', 'VERBOSITY=verbose'] : [])")
  );
  assert.match(
    runner,
    /testDependencyPhase === 'verified'\s*&&\s*args\.includes\('-f'\)/u
  );
  assert.ok(runner.includes('retainNormalizationFailure(result, {'));
  assert.ok(
    runner.includes("throw new Error('Bounded employee schema command failed')")
  );
});
