import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';
import { safeFixtureFailure } from './mail-profile-runtime.mjs';
import {
  nextTimingObservations,
  observeFixtureFailure,
  privateStartupDiagnostics,
  readStageObservations,
  startupCategories,
} from './mail-profile-startup-diagnostics.mjs';

test('startup log diagnostics contain only allowlisted categories', () => {
  assert.deepEqual(
    startupCategories('token=private-value MODULE_NOT_FOUND /secret/path'),
    ['missing-module']
  );
  assert.deepEqual(startupCategories('Error: private-value'), []);
  assert.deepEqual(startupCategories('EDQUOT EADDRINUSE'), [
    'storage-quota',
    'address-in-use',
  ]);
});

test('private collection is bounded and rejects symlink log sources', async () => {
  const reports = await fs.mkdtemp(
    path.join(os.tmpdir(), 'startup-diagnostics-test-')
  );
  try {
    await fs.writeFile(
      path.join(reports, 'web-private.log'),
      `${'x'.repeat(150000)} MODULE_NOT_FOUND token=private-value`,
      { mode: 0o600 }
    );
    await fs.symlink(
      'web-private.log',
      path.join(reports, 'lettin-private.log')
    );
    const records = await privateStartupDiagnostics(reports, [
      { profileApp: 'web', exitCode: 1, signalCode: null },
    ]);
    assert.equal(records[0].postCleanupExitCode, 1);
    assert.equal(records[0].inspectedBytes, 128 * 1024);
    assert.equal(records[0].truncated, true);
    assert.deepEqual(records[0].categories, ['missing-module']);
    assert.equal(records[0].causeProven, false);
    assert.equal(records[1].logRead, 'private-read-failed');
    assert.equal(records[1].readStages, undefined);
    assert.equal(JSON.stringify(records).includes('private-value'), false);
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});

test('inner safe startup reason survives lifecycle assertion wrapping', async () => {
  let reason;
  const inner = new Error('Owned web app exited before readiness');
  const runner = observeFixtureFailure(
    async () => {
      throw inner;
    },
    safeFixtureFailure,
    (value) => {
      reason ??= value;
    }
  );
  await assert.rejects(runner(), (error) => error === inner);
  let wrapper;
  try {
    assert.equal(1, 0, 'Full fixture or scoped Supabase stop failed');
  } catch (error) {
    wrapper = error;
  }
  assert.equal(safeFixtureFailure(wrapper), 'unclassified-fixture-failure');
  reason ??= safeFixtureFailure(wrapper);
  assert.equal(reason, 'web-app-before-readiness');
});

test('failure observation passes successful values without recording a failure', async () => {
  const records = [];
  const runner = observeFixtureFailure(
    async (...args) => args,
    safeFixtureFailure,
    (value) => records.push(value)
  );
  assert.deepEqual(await runner('owned', 2), ['owned', 2]);
  assert.deepEqual(records, []);
});

test('failure observation exposes only fixed classification and preserves rejection identity', async () => {
  const records = [];
  const inner = new Error(
    'token=private-value /secret/path arbitrary startup text'
  );
  const runner = observeFixtureFailure(
    async () => {
      throw inner;
    },
    safeFixtureFailure,
    (value) => records.push(value)
  );
  await assert.rejects(runner(), (error) => error === inner);
  assert.deepEqual(records, ['unclassified-fixture-failure']);
  assert.equal(JSON.stringify(records).includes('private-value'), false);
  assert.equal(JSON.stringify(records).includes('/secret/path'), false);
});

// Synthetic known-family inputs exercise safe enums, not the actual hosted cause.
const additionalFamilies = [
  ['unsupported-cli-option', "error: unknown option '--private-option'"],
  ['next-config-load', 'Failed to load next.config.ts'],
  ['module-export-contract', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['node-option-rejected', '--private-option is not allowed in NODE_OPTIONS'],
  ['runtime-syntax', 'SyntaxError: unexpected private-value'],
];
for (const [category, message] of additionalFamilies) {
  test(`additional startup family ${category} reveals no private text`, () => {
    const input = `${message} token=private-value /secret/path https://private.invalid/?credential=private-value`;
    const output = startupCategories(input);
    assert.deepEqual(output, [category]);
    assert.equal(JSON.stringify(output).includes('private-value'), false);
    assert.equal(JSON.stringify(output).includes('/secret/path'), false);
    assert.equal(JSON.stringify(output).includes('private.invalid'), false);
    assert.deepEqual(startupCategories(input + input), [category]);
  });
}

test('new private startup families remain bounded enums with cause unproved', async () => {
  const reports = await fs.mkdtemp(
    path.join(os.tmpdir(), 'startup-families-test-')
  );
  try {
    await fs.writeFile(
      path.join(reports, 'web-private.log'),
      additionalFamilies.map(([, message]) => message).join('\n') +
        '\ntoken=private-value /secret/path https://private.invalid/credential',
      { mode: 0o600 }
    );
    const records = await privateStartupDiagnostics(reports, [
      { profileApp: 'web', exitCode: 1, signalCode: null },
    ]);
    assert.deepEqual(
      records[0].categories,
      additionalFamilies.map(([name]) => name)
    );
    assert.equal(records[0].causeProven, false);
    assert.equal(records[0].logRead, 'bounded-private-tail');
    assert.equal(records[0].truncated, false);
    assert.equal(records[0].inspectedBytes, records[0].logBytes);
    const output = JSON.stringify(records);
    for (const privateText of [
      'private-value',
      '/secret/path',
      'private.invalid',
      'unknown option',
    ])
      assert.equal(output.includes(privateText), false);
    assert.deepEqual(
      startupCategories(
        'token=private-value /secret/path unknown private cause'
      ),
      []
    );
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});

test('read stages retain fixed observations without private log text', () => {
  const output = readStageObservations(
    [
      '[lettin-read] profile actor started',
      '[lettin-read] profile actor completed { elapsedMs: 2 }',
      '[lettin-read] layout workspace failed { elapsedMs: 3 }',
      '[lettin-read] private token started',
      '[lettin-read] profile actor failed token=private-value /secret/path',
      'private-value https://private.invalid/secret',
    ].join('\n')
  );
  assert.equal(output.events, 3);
  assert.equal(output.truncated, false);
  assert.equal(output.requestAttribution, 'unavailable');
  assert.deepEqual(output.stages, [
    {
      stage: 'profile actor',
      started: 1,
      completed: 1,
      failed: 0,
      lastStatus: 'completed',
      elapsedMs: {
        observedCount: 1,
        maxMs: 2,
        absentCount: 0,
        invalidCount: 0,
      },
    },
    {
      stage: 'layout workspace',
      started: 0,
      completed: 0,
      failed: 1,
      lastStatus: 'failed',
      elapsedMs: {
        observedCount: 1,
        maxMs: 3,
        absentCount: 0,
        invalidCount: 0,
      },
    },
  ]);
  for (const secret of ['private-value', '/secret/path', 'private.invalid']) {
    assert.equal(JSON.stringify(output).includes(secret), false);
  }
});

test('read counts cap events and retain incomplete evidence', () => {
  const overflow = readStageObservations(
    Array(257).fill('[lettin-read] profile worlds started').join('\n')
  );
  assert.equal(overflow.events, 256);
  assert.equal(overflow.stages[0].started, 256);
  assert.equal(overflow.eventsTruncated, true);
  assert.equal(overflow.truncated, true);
  const tail = readStageObservations(
    [
      '[lettin-read] profile actor started',
      '[lettin-read] layout session started',
      '[lettin-read] layout session started',
      '[lettin-read] layout session completed { elapsedMs: 1 }',
    ].join('\n'),
    true
  );
  assert.equal(tail.tailTruncated, true);
  assert.equal(tail.events, 3);
  assert.equal(tail.stages.length, 1);
  assert.equal(tail.stages[0].started, 2);
  assert.equal(tail.stages[0].completed, 1);
  assert.equal(tail.requestAttribution, 'unavailable');
  const clipped = readStageObservations(
    `${'x'.repeat(150000)}\n[lettin-read] profile actor started`
  );
  assert.equal(clipped.tailTruncated, true);
  assert.equal(clipped.events, 1);
  assert.deepEqual(readStageObservations('unrelated secret').stages, []);
});

test('owned Lettin log projects only safe stage counts', async () => {
  const reports = await fs.mkdtemp(path.join(os.tmpdir(), 'read-stages-test-'));
  try {
    await fs.writeFile(
      path.join(reports, 'lettin-private.log'),
      [
        '[lettin-read] profile bindings started',
        '[lettin-read] profile bindings failed { elapsedMs: 1 }',
        'Error: token=private-value /secret/path',
      ].join('\n'),
      { mode: 0o600 }
    );
    const records = await privateStartupDiagnostics(reports, [
      { profileApp: 'lettin', exitCode: 0, signalCode: null },
    ]);
    assert.equal(records[1].logRead, 'bounded-private-tail');
    assert.equal(records[1].readStages.events, 2);
    assert.equal(records[1].readStages.stages[0].lastStatus, 'failed');
    assert.equal(records[1].readStages.truncated, false);
    assert.equal(records[1].causeProven, false);
    assert.equal(JSON.stringify(records).includes('private-value'), false);
    assert.equal(JSON.stringify(records).includes('/secret/path'), false);
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});

test('terminal read timing distinguishes zero, absent, invalid and large values', () => {
  const output = readStageObservations(
    [
      '[lettin-read] profile actor completed { elapsedMs: 0 }',
      '[lettin-read] profile actor completed { elapsedMs: 999999999999 }',
      '[lettin-read] profile actor completed',
      ...['-1', '1000000000000', 'NaN', '1.5', '1e3', '1.0'].map(
        (value) => `[lettin-read] profile actor failed { elapsedMs: ${value} }`
      ),
    ].join('\n')
  );
  assert.equal(output.events, 9);
  assert.equal(output.stages[0].failed, 6);
  assert.equal(output.stages[0].lastStatus, 'failed');
  assert.deepEqual(output.stages[0].elapsedMs, {
    observedCount: 2,
    maxMs: 999999999999,
    absentCount: 1,
    invalidCount: 6,
  });
  const zero = readStageObservations(
    '[lettin-read] profile worlds failed { elapsedMs: 0 }'
  );
  assert.equal(zero.stages[0].elapsedMs.maxMs, 0);
  assert.equal(zero.stages[0].failed, 1);
  const missing = readStageObservations('[lettin-read] profile worlds failed');
  assert.equal(missing.stages[0].elapsedMs.maxMs, null);
  assert.equal(missing.stages[0].elapsedMs.absentCount, 1);
});

test('interleaved reads retain independent maxima without correlation or sums', () => {
  const output = readStageObservations(
    [
      '[lettin-read] profile actor started',
      '[lettin-read] layout session started',
      '[lettin-read] profile actor started',
      '[lettin-read] layout session completed { elapsedMs: 30 }',
      '[lettin-read] profile actor failed { elapsedMs: 40 }',
      '[lettin-read] profile actor completed { elapsedMs: 20 }',
    ].join('\n')
  );
  assert.equal(output.requestAttribution, 'unavailable');
  assert.equal(output.stages[0].elapsedMs.maxMs, 40);
  assert.equal(output.stages[0].elapsedMs.observedCount, 2);
  assert.equal(output.stages[0].failed, 1);
  assert.equal(output.stages[1].elapsedMs.maxMs, 30);
  for (const stage of output.stages) {
    assert.equal('totalMs' in stage.elapsedMs, false);
    assert.equal('requestId' in stage, false);
  }
});

test('Next emitter grammar distinguishes compiler duration, readiness and prose', () => {
  const output = nextTimingObservations(
    [
      '○ Compiling /[locale]/[wsId]/profile ...',
      '✓ Compiled in 51.4s',
      '\x1b[32m\x1b[1m✓\x1b[22m\x1b[39m Ready in 1500ms',
      '✓ Ready in 2.5min',
      '✓ Compiled in 0ms',
      'incidental prose: Compiled in 52s',
      ' GET /profile 200 in 51s',
      'Ready',
    ].join('\n')
  );
  assert.equal(output.events, 5);
  assert.equal(output.state, 'observed');
  assert.equal(output.requestAttribution, 'unavailable');
  assert.equal(output.profileAttribution, 'unavailable');
  assert.equal(output.stages[0].stage, 'compilation-started');
  assert.equal(output.stages[0].elapsedMs.maxMs, null);
  assert.equal(output.stages[1].elapsedMs.observedCount, 2);
  assert.equal(output.stages[1].elapsedMs.maxMs, 51400);
  assert.equal(output.stages[2].stage, 'framework-ready');
  assert.equal(output.stages[2].elapsedMs.maxMs, 150000);
  assert.equal(JSON.stringify(output).includes('/profile'), false);
});

test('timing parsers reject unknown stages, adjacent payloads and unknown formats', () => {
  const secret = 'https://private.invalid/?token=private-value';
  const reads = readStageObservations(
    [
      '[lettin-read] secret stage completed { elapsedMs: 51 }',
      `[lettin-read] profile actor completed { elapsedMs: 51 } ${secret}`,
      `[lettin-read] profile actor failed { elapsedMs: 1, token: '${secret}' }`,
    ].join('\n')
  );
  const next = nextTimingObservations(
    [
      `✓ Compiled in 51s ${secret}`,
      `✓ Ready in 1ms ${secret}`,
      `○ Compiling ${secret} ...`,
      `prefix ${secret} ✓ Compiled in 51s`,
      'Compiled profile in 51s',
      '✓ Compiled in -1ms',
      '✓ Compiled in NaNs',
      '✓ Compiled in 9999999999999ms',
      ' GET /profile 200 in 51s',
    ].join('\n')
  );
  assert.equal(reads.events, 0);
  assert.equal(next.events, 0);
  assert.equal(next.state, 'unknown');
  assert.deepEqual(next.stages, []);
  for (const output of [reads, next]) {
    for (const value of ['private-value', 'private.invalid', 'secret stage']) {
      assert.equal(JSON.stringify(output).includes(value), false);
    }
  }
  const overflow = nextTimingObservations('✓ Compiled in 999999999999s');
  assert.equal(overflow.stages[0].elapsedMs.invalidCount, 1);
  assert.equal(overflow.stages[0].elapsedMs.maxMs, null);
});

test('compiler and read observations preserve both explanations without assigning blame', () => {
  for (const [readMs, compilerLine, compileMs] of [
    [2, '✓ Compiled in 51.4s', 51400],
    [51400, ' GET /profile 200 in 52s', null],
  ]) {
    const input = `[lettin-read] profile actor completed { elapsedMs: ${readMs} }\n${compilerLine}`;
    const read = readStageObservations(input);
    const next = nextTimingObservations(input);
    assert.equal(read.stages[0].elapsedMs.maxMs, readMs);
    assert.equal(next.stages[0]?.elapsedMs.maxMs ?? null, compileMs);
    assert.equal(next.state, compileMs === null ? 'unknown' : 'observed');
    assert.equal(read.requestAttribution, 'unavailable');
    assert.equal(next.profileAttribution, 'unavailable');
    assert.equal('causeProven' in next, false);
  }
});

test('fixed timing summaries retain tail and event limits within the byte cap', () => {
  const read = readStageObservations(
    Array(257)
      .fill('[lettin-read] profile actor failed { elapsedMs: 999999999999 }')
      .join('\n')
  );
  const next = nextTimingObservations(
    Array(257).fill('✓ Compiled in 1ms').join('\n')
  );
  for (const output of [read, next]) {
    assert.equal(output.events, 256);
    assert.equal(output.eventsTruncated, true);
    assert.equal(output.truncated, true);
    assert.equal(output.summaryTruncated, false);
    assert.ok(
      Buffer.byteLength(JSON.stringify(output)) <= output.summaryByteLimit
    );
  }
  assert.equal(read.stages[0].elapsedMs.observedCount, 256);
  const partial = nextTimingObservations(
    '✓ Compiled in 51s\n✓ Ready in 0ms',
    true
  );
  assert.equal(partial.events, 1);
  assert.equal(partial.stages[0].stage, 'framework-ready');
  assert.equal(partial.tailTruncated, true);
  const clipped = nextTimingObservations(
    `${'x'.repeat(150000)}\n✓ Compiled in 1ms`
  );
  assert.equal(clipped.events, 1);
  assert.equal(clipped.tailTruncated, true);
});

test('collector preserves safe missing, mode and hardlink outcomes', async () => {
  const reports = await fs.mkdtemp(
    path.join(os.tmpdir(), 'timing-input-gates-')
  );
  try {
    let records = await privateStartupDiagnostics(reports, []);
    assert.deepEqual(
      records.map((record) => record.logRead),
      ['not-created', 'not-created']
    );
    const web = path.join(reports, 'web-private.log');
    await fs.writeFile(web, '✓ Compiled in 51s', { mode: 0o644 });
    await fs.chmod(web, 0o644);
    await fs.writeFile(
      path.join(reports, 'lettin-private.log'),
      '✓ Ready in 1ms',
      { mode: 0o600 }
    );
    await fs.link(
      path.join(reports, 'lettin-private.log'),
      path.join(reports, 'linked')
    );
    records = await privateStartupDiagnostics(reports, []);
    for (const record of records) {
      assert.equal(record.logRead, 'unsafe-file-retained');
      assert.equal(record.nextTiming, undefined);
    }
    await fs.chmod(web, 0o600);
    records = await privateStartupDiagnostics(reports, []);
    assert.equal(records[0].nextTiming.stages[0].elapsedMs.maxMs, 51000);
    assert.equal(records[0].causeProven, false);
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});

test('unsafe owner and read failure never expose timing or error text', async () => {
  for (const unsafeOwner of [true, false]) {
    let reads = 0;
    let closes = 0;
    const opened = mock.method(fs, 'open', async () => ({
      stat: async () => ({
        isFile: () => true,
        nlink: 1,
        uid: process.getuid() + Number(unsafeOwner),
        mode: 0o600,
        size: 20,
      }),
      read: async () => {
        reads += 1;
        throw new Error('token=private-value');
      },
      close: async () => {
        closes += 1;
      },
    }));
    try {
      const records = await privateStartupDiagnostics('/unused', []);
      assert.equal(reads, unsafeOwner ? 0 : 2);
      assert.equal(closes, 2);
      for (const record of records) {
        assert.equal(
          record.logRead,
          unsafeOwner ? 'unsafe-file-retained' : 'private-read-failed'
        );
        assert.equal(record.nextTiming, undefined);
        assert.equal(record.readStages, undefined);
      }
      assert.equal(JSON.stringify(records).includes('private-value'), false);
    } finally {
      opened.mock.restore();
    }
  }
});

test('installed webpack bundled timing remains distinct from compilation completion', () => {
  const output = nextTimingObservations(
    [
      '  bundled /profile in 51.4s (123 modules), type checking...',
      '  bundled /login in 2ms, type checking...',
      '  bundled /secret?token=private-value in 1ms, type checking...',
      '  bundled /profile in 1ms (123 modules), type checking... private-value',
    ].join('\n')
  );
  assert.equal(output.events, 2);
  assert.equal(output.stages.length, 1);
  assert.equal(output.stages[0].stage, 'bundled-typechecking');
  assert.equal(output.stages[0].elapsedMs.maxMs, 51400);
  assert.equal(output.profileAttribution, 'unavailable');
  assert.equal(JSON.stringify(output).includes('private-value'), false);
  assert.equal(JSON.stringify(output).includes('/profile'), false);
});

for (const [stage, prefix, suffix] of [
  ['compilation-completed', '✓ Compiled in ', ''],
  ['framework-ready', '✓ Ready in ', ''],
  ['bundled-typechecking', '  bundled /profile in ', ', type checking...'],
]) {
  test(`${stage} retains exact decimal seconds and advances a preceding maximum`, () => {
    for (const preceding of [[], [`${prefix}2ms${suffix}`]]) {
      const output = nextTimingObservations(
        [...preceding, `${prefix}32.3s${suffix}`].join('\n')
      );
      assert.equal(output.events, preceding.length + 1);
      assert.equal(output.stages.length, 1);
      assert.equal(output.stages[0].stage, stage);
      assert.equal(output.stages[0].count, preceding.length + 1);
      assert.deepEqual(output.stages[0].elapsedMs, {
        observedCount: preceding.length + 1,
        maxMs: 32300,
        absentCount: 0,
        invalidCount: 0,
      });
    }
  });
}
