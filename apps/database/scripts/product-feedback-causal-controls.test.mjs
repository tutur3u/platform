import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertCatalogRestored,
  assertCausalGreen,
  assertExpectedRed,
  buildCausalInventory,
  catalogSQL,
  causalDeadline,
  causalPins,
  digest,
  feedbackCausalReceipt,
  preflightSQL,
  readCatalog,
  selectFeedbackCausal,
} from './product-feedback-causal-controls.mjs';
import {
  finishFeedbackCausalPhase,
  runFeedbackCausalPhase,
} from './product-feedback-causal-runner.mjs';
import { runIsolatedLifecycle } from './run-supabase-isolated.js';

const root = new URL('../../../', import.meta.url);
const migration = readFileSync(new URL(causalPins.migration, root), 'utf8');
const fixture = readFileSync(new URL(causalPins.fixture, root), 'utf8');
const inventory = buildCausalInventory(migration, fixture);
const bodyStart =
  migration.indexOf(
    'AS $$',
    migration.indexOf('CREATE FUNCTION private.assert_product_feedback_staff(')
  ) + 5;
const body = migration.slice(
  bodyStart,
  migration.indexOf('\n$$;', bodyStart) + 1
);
const baseline = {
  definition:
    'CREATE OR REPLACE FUNCTION private.assert_product_feedback_staff(p_actor uuid)\n RETURNS void',
  body,
  owner: '10',
  acl: ['postgres=X/postgres'],
  settings: ['search_path=""', 'statement_timeout=3s', 'lock_timeout=500ms'],
  securityDefiner: true,
  identity: '200',
  language: 'plpgsql',
  triggerEnabled: 'O',
};
const output = (stdout, extra = {}) => ({
  status: 0,
  stdout,
  stderr: '',
  ...extra,
});
// Representative format from pgTAP v1.3.0 sql/pgtap.sql.in: ok/diag/throws_ok.
// Canonical source format, not captured live SQL output. No-exception wanted omits errmsg.
const redDescriptions = {
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
};
const tap = (failed = [], count = 31) =>
  [
    'BEGIN',
    `1..${count}`,
    ...Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const description = redDescriptions[n] ?? 'synthetic assertion';
      return failed.includes(n)
        ? `not ok ${n} - ${description}\n# Failed test ${n}: "${description}"\n#       caught: no exception\n#       wanted: ${n === 27 ? '42501' : 'PT403'}`
        : `ok ${n} - synthetic assertion`;
    }),
    ...(failed.length
      ? [
          `# Looks like you failed ${failed.length} test${failed.length === 1 ? '' : 's'} of ${count}`,
        ]
      : []),
    'ROLLBACK',
    '',
  ].join('\n');
const catalog = (extra = {}) =>
  output(JSON.stringify({ ...baseline, ...extra }));
const receipt = (state, extra = {}) =>
  feedbackCausalReceipt({
    state,
    sourceSha: 'a'.repeat(40),
    controlSha: 'b'.repeat(40),
    schemaQualified: true,
    generatedTypesSha256: 'c'.repeat(64),
    lifecycleCode: 0,
    cleanupSucceeded: true,
    ...extra,
  });
function harness(intercept = () => undefined) {
  const calls = [];
  const state = { inventory, observations: [] };
  const run = (sql, timeout) => {
    calls.push(sql);
    assert.ok(timeout > 0 && timeout <= 60000);
    const injected = intercept(sql, calls);
    if (injected !== undefined) return injected;
    if (sql === preflightSQL) return output('READY\n');
    if (sql === catalogSQL) return catalog();
    if (sql === fixture) return output(tap());
    const variant = inventory.variants.find((v) => v.sql === sql);
    assert.ok(variant, 'protocol may execute only frozen payloads');
    return output(tap(variant.failedOrdinals));
  };
  return { state, run, calls, remaining: causalDeadline(() => 0) };
}

test('causal profile is explicit default-OFF and requires feedback', () => {
  for (const v of [undefined, 'false'])
    assert.equal(selectFeedbackCausal(v, false), false);
  assert.equal(selectFeedbackCausal('true', true), true);
  assert.throws(() => selectFeedbackCausal('true', false));
  for (const v of [true, false, null, '', 'TRUE', '1'])
    assert.throws(() => selectFeedbackCausal(v, true));
});

test('inventory binds actual source bytes and exactly eight independent removals', () => {
  assert.deepEqual(
    inventory.bindings.map((v) => [v.id, v.failedOrdinals]),
    [
      ['service-role', [27]],
      ['actor-binding', [15, 16, 17]],
      ['staff-email', [20]],
      ['active-lifecycle', [18, 19]],
      ['confirmed-email', [22]],
      ['ban', [21]],
      ['boolean-marker', [23, 24, 25, 26]],
      ['registry-correlation', [31]],
    ]
  );
  assert.equal(digest(body), inventory.bodySha256);
  for (const v of inventory.variants) {
    assert.equal(digest(v.sql), v.sqlSha256);
    assert.equal(v.sql.split('SELECT plan(31);').length, 2);
    const begin = v.sql.indexOf('BEGIN;\n') + 'BEGIN;\n'.length;
    const end = v.sql.indexOf('\nCREATE EXTENSION', begin);
    const definition = v.sql.slice(begin, end);
    assert.equal(digest(definition), v.definitionSha256);
    assert.ok(definition.includes('AS $$'));
    assert.ok(definition.endsWith('\n$$;'));
    assert.equal(v.sql.slice(0, begin) + v.sql.slice(end + 1), fixture);
    const statements = fixture.match(
      /^SELECT (?:ok|is|throws_ok)\([\s\S]*?;$/gmu
    );
    assert.equal(statements.length, 31);
    for (const statement of statements)
      assert.equal(v.sql.split(statement).length, 2);
    assert.equal(
      v.sql.split(
        'CREATE OR REPLACE FUNCTION private.assert_product_feedback_staff('
      ).length,
      2
    );
  }
  assert.throws(() => buildCausalInventory(`${migration}\n`, fixture));
  assert.throws(() => buildCausalInventory(migration, `${fixture}\n`));
  assert.throws(() => inventory.bindings.push({}));
  assert.throws(() => inventory.bindings[0].failedOrdinals.push(1));
});

test('separate RED parser accepts every exact complete expected set', () => {
  for (const v of inventory.variants)
    assert.deepEqual(
      assertExpectedRed(output(tap(v.failedOrdinals)), v.failedOrdinals),
      { assertions: 31, failedOrdinals: v.failedOrdinals }
    );
  assert.equal(assertCausalGreen(output(tap())), 31);
  assert.throws(() => assertCausalGreen(output(tap([31]))));
});

for (const [name, result] of [
  ['no failure', output(tap())],
  ['wrong ordinal', output(tap([30]))],
  ['extra failure', output(tap([30, 31]))],
  ['SQL error', output(tap([31]), { status: 1 })],
  [
    'stderr SQL error',
    output(tap([31]), { stderr: 'ERROR: synthetic SQL error' }),
  ],
  ['timeout', output(tap([31]), { error: { code: 'ETIMEDOUT' } })],
  ['signal', output(tap([31]), { signal: 'SIGKILL' })],
  ['timeout flag', output(tap([31]), { timedOut: true })],
  ['truncated', output(tap([31]).replace('ok 1 - synthetic assertion\n', ''))],
  ['duplicate', output(tap([31]).replace('ok 2 -', 'ok 1 -'))],
  ['wrong plan', output(tap([31]).replace('1..31', '1..30'))],
  ['multiple plans', output(`${tap([31])}1..31\n`)],
  [
    'skip',
    output(
      tap([31]).replace('ok 1 - synthetic assertion', 'ok 1 - synthetic # SKIP')
    ),
  ],
  ['todo', output(`${tap([31])}# TODO\n`)],
  ['bailout', output(`${tap([31])}Bail out!\n`)],
  ['commit', output(tap([31]).replace('ROLLBACK', 'COMMIT'))],
  ['missing rollback', output(tap([31]).replace('ROLLBACK', ''))],
  ['oversized', output('x'.repeat(1024 * 1024 + 1))],
])
  test(`RED refuses ${name}`, () =>
    assert.throws(() => assertExpectedRed(result, [31])));

for (const [name, alter] of [
  ...[
    '42501: permission denied',
    '55P03: lock timeout',
    '57014: query canceled',
    'PT403: Feedback forbidden',
    'XX000: internal error',
  ].map((value) => [
    value,
    (s) => s.replace('caught: no exception', `caught: ${value}`),
  ]),
  [
    'missing diagnostics',
    (s) =>
      s.replace(
        /# Failed test[^\n]*\n# {7}caught:[^\n]*\n# {7}wanted:[^\n]*\n/u,
        ''
      ),
  ],
  [
    'duplicate diagnostics',
    (s) =>
      s.replace(
        '#       caught: no exception',
        '#       caught: no exception\n#       caught: no exception'
      ),
  ],
  [
    'duplicate complete block',
    (s) =>
      s.replace(
        '#       wanted: PT403',
        '#       wanted: PT403\n# Failed test 31: "matching email cannot substitute another registry identity"\n#       caught: no exception\n#       wanted: PT403'
      ),
  ],
  [
    'wrong header ordinal',
    (s) => s.replace('# Failed test 31:', '# Failed test 27:'),
  ],
  [
    'wrong header description',
    (s) =>
      s.replace(
        '# Failed test 31: "matching',
        '# Failed test 31: "other matching'
      ),
  ],
  [
    'wrong assertion description',
    (s) => s.replace('not ok 31 - matching', 'not ok 31 - other matching'),
  ],
  ['wrong wanted code', (s) => s.replace('wanted: PT403', 'wanted: 42501')],
  [
    'unexpected wanted message',
    (s) => s.replace('wanted: PT403', 'wanted: PT403: Feedback forbidden'),
  ],
  ['malformed caught', (s) => s.replace('#       caught:', '# caught:')],
  ['missing wanted', (s) => s.replace('#       wanted: PT403\n', '')],
  [
    'unbound extra caught',
    (s) =>
      s.replace(
        'ok 1 - synthetic assertion',
        'ok 1 - synthetic assertion\n#       caught: no exception'
      ),
  ],
  [
    'duplicate finish',
    (s) =>
      s.replace('ROLLBACK', '# Looks like you failed 1 test of 31\nROLLBACK'),
  ],
  [
    'malformed diagnostic block',
    (s) => s.replace('# Failed test 31:', 'Failed test 31:'),
  ],
])
  test(`RED diagnostic refuses ${name}`, () => {
    assert.throws(() => assertExpectedRed(output(alter(tap([31]))), [31]));
  });

test('diagnostics bind fixed SQLSTATE and message contract to original fixture descriptions', () => {
  for (const [ordinal, description] of Object.entries(redDescriptions)) {
    const code = Number(ordinal) === 27 ? '42501' : 'PT403';
    const message =
      Number(ordinal) === 27 ? 'Service role required' : 'Feedback forbidden';
    assert.ok(fixture.includes(`'${code}','${message}','${description}');`));
  }
  assert.throws(() =>
    assertExpectedRed(
      output(tap([27]).replace('wanted: 42501', 'wanted: PT403')),
      [27]
    )
  );
  const misbound = tap([18, 19]).replace(
    '# Failed test 18: "pending denies"',
    '# Failed test 19: "provisioned denies"'
  );
  assert.throws(() => assertExpectedRed(output(misbound), [18, 19]));
});

test('RED refuses malformed expected sets', () => {
  for (const set of [[], [0], [32], [31, 31], [31, 30], ['31']])
    assert.throws(() => assertExpectedRed(output(tap([31])), set));
});

test('deadline uses monotonic elapsed time and fails closed without retries', () => {
  let now = 0;
  const remaining = causalDeadline(() => now);
  assert.equal(remaining(), 60000);
  now = 1199999;
  assert.equal(remaining(), 1);
  now = 1200000;
  assert.throws(() => remaining());
  now = 10;
  const rewind = causalDeadline(() => now);
  now = 9;
  assert.throws(() => rewind());
  assert.throws(() => causalDeadline(() => NaN));
  assert.throws(() => causalDeadline(() => 0)(1200001));
});

test('catalog is actual bounded JSON, source-body-bound, and exact across every property', () => {
  const original = readCatalog(catalog(), inventory.bodySha256);
  assert.equal(
    assertCatalogRestored(original, original),
    digest(JSON.stringify(original))
  );
  for (const change of [
    { body: `${body} ` },
    { triggerEnabled: 'D' },
    { language: 'sql' },
    { settings: [] },
    { securityDefiner: false },
    { extra: true },
  ])
    assert.throws(() => readCatalog(catalog(change), inventory.bodySha256));
  for (const change of [
    { owner: '11' },
    { acl: ['public=X/postgres'] },
    { identity: '201' },
    { definition: `${baseline.definition} ` },
  ])
    assert.throws(() =>
      assertCatalogRestored(
        original,
        readCatalog(catalog(change), inventory.bodySha256)
      )
    );
  assert.throws(() => readCatalog(output('not JSON'), inventory.bodySha256));
});

test('protocol executes eight REDs, seven intermediate GREENs, readbacks, then requires terminal GREEN', () => {
  const h = harness();
  runFeedbackCausalPhase(h.state, h.run, h.remaining);
  assert.equal(
    h.calls.filter((s) => inventory.variants.some((v) => v.sql === s)).length,
    8
  );
  assert.equal(h.calls.filter((s) => s === fixture).length, 7);
  assert.equal(receipt(h.state).causalQualified, false);
  finishFeedbackCausalPhase(h.state, h.run, h.remaining);
  const result = receipt(h.state);
  assert.equal(result.causalQualified, true);
  assert.equal(result.redAssertions, 248);
  assert.equal(result.intermediateGreenAssertions, 217);
  assert.equal(result.terminalGreenAssertions, 278);
  assert.equal(result.domainRegexp, 'structural-redundancy-not-mutated');
  assert.ok(!JSON.stringify(result).includes(baseline.body));
});

test('SQL/timeout/precondition failures stop at the actual first attempt and retain partial state', () => {
  for (const bad of [
    output('', { status: 1 }),
    output('', { error: { code: 'ETIMEDOUT' } }),
  ]) {
    const h = harness((sql) =>
      sql === inventory.variants[1].sql ? bad : undefined
    );
    assert.throws(() => runFeedbackCausalPhase(h.state, h.run, h.remaining));
    assert.equal(
      h.calls.filter((s) => s === inventory.variants[1].sql).length,
      1
    );
    assert.equal(h.state.observations.length, 2);
    assert.equal(h.state.observations[0].green, true);
    assert.equal(receipt(h.state, { lifecycleCode: 1 }).causalQualified, false);
  }
  const h = harness((sql) =>
    sql === preflightSQL ? output('DENY') : undefined
  );
  assert.throws(() => runFeedbackCausalPhase(h.state, h.run, h.remaining));
  assert.equal(h.calls.length, 1);
});

test('unrestored catalog cannot qualify RED or proceed to GREEN/next variant', () => {
  let catalogs = 0;
  const h = harness((sql) =>
    sql === catalogSQL && ++catalogs > 1 ? catalog({ owner: '11' }) : undefined
  );
  assert.throws(() => runFeedbackCausalPhase(h.state, h.run, h.remaining));
  assert.equal(h.state.observations.length, 1);
  assert.equal(h.state.observations[0].red, true);
  assert.equal(h.state.observations[0].catalogRestored, false);
  assert.equal(h.calls.filter((s) => s === fixture).length, 0);
});

test('receipt rejects cleanup/lifecycle/typegen/identity/terminal/ordered-inventory failures', () => {
  const h = harness();
  runFeedbackCausalPhase(h.state, h.run, h.remaining);
  finishFeedbackCausalPhase(h.state, h.run, h.remaining);
  for (const extra of [
    { cleanupSucceeded: false },
    { lifecycleCode: 1 },
    { schemaQualified: false },
    { generatedTypesSha256: null },
    { sourceSha: 'bad' },
    { controlSha: '0'.repeat(40) },
  ])
    assert.equal(receipt(h.state, extra).causalQualified, false);
  const reversed = {
    ...h.state,
    observations: h.state.observations.toReversed(),
  };
  assert.equal(receipt(reversed).causalQualified, false);
});

test('workflow input is default-OFF and real legacy controls isolate both inherited flags', () => {
  const workflow = readFileSync(
    new URL('.github/workflows/employee-schema-contract.yaml', root),
    'utf8'
  );
  assert.match(
    workflow,
    /include_feedback_causal:\n {8}description: [^\n]+\n {8}required: false\n {8}default: false\n {8}type: boolean/u
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK_CAUSAL: \$\{\{ inputs.include_feedback_causal \}\}/u
  );
  const env = {
    ...process.env,
    EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: 'true',
    EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK_CAUSAL: 'true',
  };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      new URL('./employee-schema-workflow.test.mjs', import.meta.url).pathname,
    ],
    // The spawned legacy suite takes ~15s alone; leave headroom under load.
    { env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /combined profiles reject incompatible selections before hosted database setup/u
  );
});

test('real runner validates causal selection before hosted setup without spoofing identity', () => {
  for (const [feedback, causal, journal, expected] of [
    ['false', 'true', 'false', /Feedback causal contract denied/u],
    ['true', 'bad', 'false', /Feedback causal contract denied/u],
    [
      'true',
      'true',
      'false',
      /This gate requires a disposable hosted Linux runner/u,
    ],
    ['true', 'true', 'true', /Select one optional schema profile/u],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        new URL('./verify-employee-schema-contract.mjs', import.meta.url)
          .pathname,
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GITHUB_ACTIONS: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_CHAT_INITIAL_SETTINGS: 'false',
          EMPLOYEE_SCHEMA_DIAGNOSE_CHAT_PROCESS: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_STRUCTURED_PROVENANCE: 'false',
          EMPLOYEE_SCHEMA_SOURCE_SHA: 'a'.repeat(40),
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: feedback,
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK_CAUSAL: causal,
          EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_PROFILE_ROUTE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_JOURNAL: journal,
          EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_HTTP: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_RESTORE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_WEB_SESSION: 'false',
        },
      }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
  }
});

test('terminal catalog drift cannot produce the final restoration receipt', () => {
  const h = harness();
  runFeedbackCausalPhase(h.state, h.run, h.remaining);
  assert.throws(() =>
    finishFeedbackCausalPhase(
      h.state,
      () => catalog({ owner: '11' }),
      h.remaining
    )
  );
  assert.equal(h.state.observations[7].green, false);
  assert.equal(receipt(h.state).causalQualified, false);
});

test('maintained lifecycle attempts only owned cleanup after causal timeout and preserves cleanup failure', async () => {
  for (const cleanupCode of [0, 9]) {
    const h = harness((sql) =>
      sql === inventory.variants[0].sql
        ? output('', { error: { code: 'ETIMEDOUT' } })
        : undefined
    );
    const commands = [];
    let removed = false;
    const code = await runIsolatedLifecycle({
      binaryPath: 'never-executed-unit-port',
      metadata: {
        disposableRoot: '/unlaunched-feedback-unit',
        projectId: 'feedback-unit-owned',
      },
      registerSignals: () => () => {},
      updateMetadata: async () => {},
      removeRoot: async () => {
        removed = true;
      },
      stderr: { write: () => {} },
      runner: async (_binary, args) => {
        commands.push(args);
        if (args.includes('stop')) return { code: cleanupCode };
        if (args.includes('test')) {
          try {
            runFeedbackCausalPhase(h.state, h.run, h.remaining);
          } catch {
            return { code: 1 };
          }
        }
        return { code: 0 };
      },
    });
    assert.equal(code, 1);
    assert.equal(commands.filter((args) => args.includes('test')).length, 1);
    const stops = commands.filter((args) => args.includes('stop'));
    assert.deepEqual(stops, [
      [
        '--workdir',
        '/unlaunched-feedback-unit',
        'stop',
        '--project-id',
        'feedback-unit-owned',
        '--no-backup',
      ],
    ]);
    assert.equal(removed, cleanupCode === 0);
    assert.equal(
      receipt(h.state, {
        lifecycleCode: code,
        cleanupSucceeded: cleanupCode === 0,
      }).causalQualified,
      false
    );
  }
});
