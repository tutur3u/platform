import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertChatBinding,
  chatCaseNames,
  chatControlFiles,
  chatFiles,
  chatMigration,
  chatQualificationReceipt,
  dartCaseNames,
  selectChatInitialSettings,
  selectChatProcessDiagnostic,
  sha256,
  webCaseNames,
} from './chat-initial-settings-qualification.mjs';
import { runChatInitialSettingsBridge } from './chat-initial-settings-runner.mjs';
import { buildOutputCapture } from './employee-web-session-build-diagnostic.mjs';

// External SQL/runtime/process ports are synthetic. These do not qualify SQL or Vitest.
const fixture = 'begin; commit; select 1;';
const runtime = {
  kind: 'node',
  nodeVersion: '24.1.0',
  runtimeVersion: '24.1.0',
  executableSha256: '1'.repeat(64),
  binSha256: '2'.repeat(64),
  vitestVersion: '5.0.3',
  nodeOptionsPresent: false,
  nodeOptionsSha256: sha256(''),
};
function sqlFixture() {
  const actorId = 'b6277131-0000-4000-8000-000000000002';
  const creatorId = 'b6277131-0000-4000-8000-000000000001';
  const wsId = 'b6277131-0000-4000-8000-000000000011';
  const personalWsId = 'a6277131-0000-4000-8000-000000000002';
  return {
    version: 1,
    committedReadback: true,
    migrationVersion: '20261018020000',
    createAllowed: true,
    manageAllowed: false,
    deniedSqlstate: '42501',
    deniedCreatedRows: 0,
    fixtureWorkspaces: [
      { id: wsId, creatorId, personal: false, creatorMember: false },
      {
        id: 'a6277131-0000-4000-8000-000000000001',
        creatorId,
        personal: true,
        creatorMember: true,
      },
      {
        id: personalWsId,
        creatorId: actorId,
        personal: true,
        creatorMember: true,
      },
    ],
    cases: chatCaseNames.map((name) => ({
      name,
      actorId,
      wsId,
      personalWsId,
      input:
        name === 'personal'
          ? { initialAiSettings: { creditWsId: personalWsId } }
          : {},
      receipt: { id: name },
      readback: { id: name },
    })),
  };
}
const report = () => ({
  success: true,
  numTotalTests: 9,
  numPassedTests: 9,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [
    {
      status: 'passed',
      assertionResults: webCaseNames.map((title) => ({
        title,
        status: 'passed',
      })),
    },
  ],
});

async function drive({
  selected = true,
  original = 'abort',
  comparison = 'pass',
  cleanup = true,
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'chat-process-unit-'));
  const binding = assertChatBinding({
    version: 1,
    sourceSha: 'a'.repeat(40),
    controlSha: 'b'.repeat(40),
    runId: '123',
    migration: { path: chatMigration, sha256: 'c'.repeat(64) },
    fixtureHashes: chatFiles.map((file, i) => ({
      path: file,
      sha256: i === 2 ? sha256(fixture) : 'c'.repeat(64),
    })),
    controlHashes: chatControlFiles.map((file) => ({
      path: file,
      sha256: 'd'.repeat(64),
    })),
  });
  const state = {},
    launches = [],
    envelopeHashes = [];
  let producerCalls = 0,
    cleanupCalls = 0,
    contextCalls = 0;
  const source = path.join(root, chatFiles[2]);
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(source, fixture);
  const context = {
    parentPid: 1000,
    nodePath: '/synthetic/node24',
    binPath: '/synthetic/vitest.mjs',
    runtime,
  };
  const processContext = () => {
    contextCalls++;
    return context;
  };
  const runSQL = async (sql) => {
    const isProducer = sql === fixture;
    if (isProducer) producerCalls++;
    else cleanupCalls++;
    if (!isProducer && cleanup === 'throw')
      throw new Error('Synthetic cleanup failure');
    return {
      status: 0,
      stdout: `BEGIN\nCOMMIT\n${JSON.stringify(isProducer ? sqlFixture() : { fixtureClean: cleanup === true })}\n`,
    };
  };
  const runProcess = async (command, args, options) => {
    const { env } = options;
    launches.push({ command, args, options });
    const bytes = readFileSync(env.CHAT_INITIAL_SETTINGS_ENVELOPE);
    envelopeHashes.push(sha256(bytes));
    const envelope = JSON.parse(bytes);
    const common = {
      binding: envelope.binding,
      envelopeSha256: sha256(bytes),
      providerCalls: 0,
    };
    if (command === 'flutter') {
      writeFileSync(
        env.CHAT_INITIAL_SETTINGS_DART_RESULT,
        JSON.stringify({ ...common, passed: dartCaseNames })
      );
      return {
        status: 0,
        signal: null,
        timedOut: false,
        processGroupStopped: true,
      };
    }
    const direct = command === context.nodePath;
    assert.equal(options.timeoutMs, 120000);
    assert.equal(options.buildOutput, true);
    if (direct) {
      assert.equal(launches.length, 2);
      assert.equal(args[0], context.binPath);
      assert.deepEqual(args.slice(1, -1), launches[0].args.slice(2, -1));
      assert.notEqual(args.at(-1), launches[0].args.at(-1));
      assert.notEqual(
        env.CHAT_INITIAL_SETTINGS_WEB_RESULT,
        launches[0].options.env.CHAT_INITIAL_SETTINGS_WEB_RESULT
      );
    }
    const fault = direct ? comparison : original;
    if (fault === 'throw')
      throw new Error('SENSITIVE arbitrary comparison error');
    writeFileSync(args.at(-1), JSON.stringify(report()));
    writeFileSync(
      env.CHAT_INITIAL_SETTINGS_WEB_RESULT,
      JSON.stringify({
        ...common,
        passed: webCaseNames,
        cases: sqlFixture().cases.map((item) => ({
          ...item,
          response: { conversation: item.receipt },
        })),
      })
    );
    const pid = direct ? 3000 : 2000;
    if (selected && fault !== 'missing-identity') {
      for (const role of ['config', 'fixture']) {
        const ancestors = [
          { pid, ppid: 1000, executableSha256: runtime.executableSha256 },
          { pid: 1000, ppid: 1, executableSha256: runtime.executableSha256 },
        ];
        if (role === 'fixture')
          ancestors.unshift({
            pid: pid + 1,
            ppid: pid,
            executableSha256: runtime.executableSha256,
          });
        const identity = {
          version: 1,
          arm: direct ? 'direct-node' : 'original',
          role,
          sourceSha: binding.sourceSha,
          controlSha: binding.controlSha,
          runId: binding.runId,
          bindingSha256: sha256(JSON.stringify(binding)),
          envelopeSha256: sha256(bytes),
          runtime,
          entrySha256: role === 'config' ? runtime.binSha256 : '4'.repeat(64),
          ancestors,
        };
        if (fault === 'identity')
          identity.runtime = { ...runtime, executableSha256: '3'.repeat(64) };
        if (fault === 'entry' && role === 'fixture')
          identity.entrySha256 = '5'.repeat(64);
        if (fault === 'extra') identity.secret = 'SENSITIVE arbitrary metadata';
        writeFileSync(
          path.join(root, `chat-process-${identity.arm}-${role}.json`),
          JSON.stringify(identity),
          { mode: 0o600 }
        );
      }
    }
    if (fault === 'report') writeFileSync(args.at(-1), '{}');
    const capture = buildOutputCapture(new Set());
    capture.append('stderr', 'SENSITIVE stream text without a known signature');
    const aborted = fault === 'abort' || (!direct && original !== 'pass');
    return {
      status: aborted || fault === 'timeout' ? null : 0,
      signal: aborted ? 'SIGABRT' : null,
      timedOut: fault === 'timeout',
      processGroupStopped: fault !== 'group',
      buildDiagnostic: capture.receipt(),
      diagnosticProcessId: fault === 'launcher' ? pid + 99 : pid,
    };
  };
  let error;
  try {
    await runChatInitialSettingsBridge({
      root,
      receiptDirectory: root,
      binding,
      runSQL,
      state,
      runProcess,
      diagnoseChatProcess: selected,
      processContext,
    });
  } catch (caught) {
    error = caught;
  }
  try {
    const diagnostic = selected
      ? JSON.parse(
          readFileSync(path.join(root, 'chat-process-diagnostic.json'), 'utf8')
        )
      : null;
    const serialized = JSON.stringify(diagnostic);
    assert.ok(
      !serialized.includes('SENSITIVE') && !serialized.includes('/synthetic/')
    );
    assert.ok(Buffer.byteLength(serialized) <= 8192);
    const receipt = chatQualificationReceipt({
      binding,
      ...state,
      lifecycleCode: error ? 1 : 0,
      databaseCleanup: true,
    });
    return {
      state,
      error,
      diagnostic,
      receipt,
      launches,
      envelopeHashes,
      producerCalls,
      cleanupCalls,
      contextCalls,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('diagnostic selection is default-off and restricted to standalone chat', () => {
  assert.equal(selectChatProcessDiagnostic(undefined, false), false);
  assert.equal(selectChatProcessDiagnostic('false', false), false);
  assert.equal(
    selectChatProcessDiagnostic('true', selectChatInitialSettings('true')),
    true
  );
  for (const value of [true, '', 'TRUE', null])
    assert.throws(() => selectChatProcessDiagnostic(value, true));
  assert.throws(() => selectChatProcessDiagnostic('true', false));
  for (const option of [
    'JOURNAL',
    'PERSONAL_JOURNAL',
    'HTTP',
    'WEB_SESSION',
    'RESTORE',
    'FEEDBACK_CAUSAL',
    'FEEDBACK',
    'ADDRESS_MIGRATION',
    'STRUCTURED_PROVENANCE',
  ])
    assert.throws(() =>
      selectChatInitialSettings('true', { [option]: 'true' })
    );
});
test('default-off adds no identity work or retry; ordinary positive still reaches Dart', async () => {
  const ok = await drive({ selected: false, original: 'pass' });
  assert.equal(ok.contextCalls, 0);
  assert.equal(ok.launches.length, 2);
  assert.equal(ok.receipt.qualified, true);
  assert.equal(ok.diagnostic, null);
  assert.equal('processDiagnostic' in ok.receipt, false);
  const selectedPass = await drive({ original: 'pass' });
  assert.equal(selectedPass.launches.length, 2);
  assert.equal(selectedPass.diagnostic.attempted, false);
  assert.equal(selectedPass.receipt.qualified, true);
  const abort = await drive({ selected: false });
  assert.equal(abort.launches.length, 1);
  assert.equal(abort.receipt.qualified, false);
  assert.equal(abort.receipt.webCases, 0);
  assert.equal(abort.receipt.dartCases, 0);
});
test('one identity-bound direct Node success cannot qualify the original abort or launch Dart', async () => {
  const value = await drive();
  assert.equal(
    value.error.message,
    'Owned chat bridge child failed or remains'
  );
  assert.equal(value.producerCalls, 1);
  assert.equal(value.cleanupCalls, 1);
  assert.equal(value.launches.length, 2);
  assert.ok(value.launches.every((item) => item.command !== 'flutter'));
  assert.equal(new Set(value.envelopeHashes).size, 1);
  assert.equal(value.state.webProcess.signal, 'SIGABRT');
  assert.equal(value.state.failurePhase, 'web');
  assert.equal(value.diagnostic.validComparison, true);
  assert.equal(value.diagnostic.identityAgreement, true);
  assert.deepEqual(Object.keys(value.diagnostic.originalIdentity), [
    'config',
    'fixture',
  ]);
  assert.deepEqual(Object.keys(value.diagnostic.comparisonIdentity), [
    'config',
    'fixture',
  ]);
  assert.equal(value.receipt.qualified, false);
  assert.equal(value.receipt.webCases, 0);
  assert.equal(value.receipt.dartCases, 0);
  assert.equal(value.state.fixtureCleanup, true);
  assert.equal(value.state.processesStopped, true);
});
test('comparison failures and malformed identities retain primary failure and same-owner cleanup', async () => {
  for (const comparison of [
    'abort',
    'timeout',
    'throw',
    'identity',
    'missing-identity',
    'launcher',
    'entry',
    'extra',
    'report',
    'group',
  ]) {
    const value = await drive({ comparison });
    assert.equal(
      value.error.message,
      'Owned chat bridge child failed or remains',
      comparison
    );
    assert.equal(value.launches.length, 2);
    assert.equal(value.producerCalls, 1);
    assert.equal(value.cleanupCalls, 1);
    assert.equal(value.diagnostic.validComparison, false);
    assert.equal(value.state.fixtureCleanup, true);
    assert.equal(value.receipt.qualified, false);
    assert.equal(value.receipt.webCases, 0);
    assert.equal(value.receipt.dartCases, 0);
    if (comparison === 'throw' || comparison === 'group')
      assert.equal(value.state.processesStopped, false);
    if (comparison === 'abort')
      assert.equal(value.diagnostic.comparison.signal, 'SIGABRT');
    if (comparison === 'timeout')
      assert.equal(value.diagnostic.comparison.timedOut, true);
  }
});
test('missing original proof never authorizes a comparison and cleanup failure preserves primary cause', async () => {
  for (const original of ['identity', 'missing-identity', 'extra', 'report']) {
    const value = await drive({ original });
    assert.equal(value.state.webProcess.signal, 'SIGABRT');
    assert.equal(
      value.error.message,
      'Owned chat bridge child failed or remains'
    );
    assert.equal(value.launches.length, 1);
    assert.equal(value.diagnostic.attempted, false);
    assert.equal(value.receipt.qualified, false);
  }
  const retained = await drive({ cleanup: false });
  assert.equal(retained.diagnostic.validComparison, false);
  assert.equal(retained.diagnostic.fixtureCleanup, false);
  assert.equal(retained.receipt.qualified, false);
  const value = await drive({ comparison: 'throw', cleanup: 'throw' });
  assert.ok(value.error instanceof AggregateError);
  assert.equal(
    value.error.cause.message,
    'Owned chat bridge child failed or remains'
  );
  assert.equal(value.error.errors.length, 2);
  assert.equal(value.state.fixtureCleanup, false);
  assert.equal(value.producerCalls, 1);
  assert.equal(value.cleanupCalls, 1);
});

// Exercise real profile subprocess boundaries without admitting hosted setup.
test('profile subprocess controls isolate the diagnostic dispatch environment', () => {
  const env = { ...process.env, GITHUB_ACTIONS: 'false' };
  for (const name of [
    'JOURNAL',
    'PERSONAL_JOURNAL',
    'HTTP',
    'WEB_SESSION',
    'RESTORE',
    'FEEDBACK_CAUSAL',
    'FEEDBACK',
    'ADDRESS_MIGRATION',
    'STRUCTURED_PROVENANCE',
  ])
    env[`EMPLOYEE_SCHEMA_INCLUDE_${name}`] = 'false';
  env.EMPLOYEE_SCHEMA_INCLUDE_CHAT_INITIAL_SETTINGS = 'true';
  env.EMPLOYEE_SCHEMA_DIAGNOSE_CHAT_PROCESS = 'true';
  delete env.NODE_TEST_CONTEXT;
  const names = [
    'combined profiles reject incompatible selections before hosted database setup',
    'runner rejects incompatible feedback profiles before hosted admission and retains the hosted guard',
    'real runner validates causal selection before hosted setup without spoofing identity',
  ];
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      '--test-reporter=tap',
      `--test-name-pattern=^(?:${names.join('|')})$`,
      ...[
        'employee-schema-workflow.test.mjs',
        'product-feedback-schema-profile.test.mjs',
        'product-feedback-causal-controls.test.mjs',
      ].map((file) => fileURLToPath(new URL(file, import.meta.url))),
    ],
    { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const name of names) {
    assert.ok(
      result.stdout
        .split('\n')
        .some(
          (line) => /^ok \d+ - /u.test(line) && line.endsWith(` - ${name}`)
        ),
      `Profile control did not pass: ${name}`
    );
  }
});
