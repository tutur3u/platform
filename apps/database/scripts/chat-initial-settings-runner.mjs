import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  assertChatBinding,
  assertChatProcessContext,
  assertPhaseResult,
  assertSqlEnvelope,
  assertVitestReport,
  chatControlFiles,
  chatFiles,
  chatMigration,
  chatProcessContext,
  dartCaseNames,
  readChatArmIdentity,
  sha256,
  webCaseNames,
  writeChatProcessDiagnostic,
} from './chat-initial-settings-qualification.mjs';
import {
  projectDartTestDiagnostic,
  projectProcessOutput,
} from './employee-web-session-build-diagnostic.mjs';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';

function trackedBytes(root, file, commit) {
  const bytes = readFileSync(path.join(root, file));
  const tracked = execFileSync(
    'git',
    ['-C', root, 'show', `${commit}:${file}`],
    { timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
  );
  if (!bytes.equals(tracked)) throw new Error('Chat tracked fixture differs');
  return bytes;
}
export function createChatBinding(root, controlRoot, env = process.env) {
  for (const [dir, pin] of [
    [root, env.EMPLOYEE_SCHEMA_SOURCE_SHA],
    [controlRoot, env.EMPLOYEE_SCHEMA_CONTROL_SHA],
  ]) {
    if (
      !/^[a-f0-9]{40}$/.test(pin ?? '') ||
      pin === '0'.repeat(40) ||
      execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 10000,
      }).trim() !== pin ||
      execFileSync(
        'git',
        ['-C', dir, 'status', '--porcelain', '--untracked-files=no'],
        { encoding: 'utf8', timeout: 10000 }
      ).trim()
    )
      throw new Error('Chat clean source/control checkout differs');
  }
  const fixtureHashes = chatFiles.map((file) => ({
    path: file,
    sha256: sha256(trackedBytes(root, file, env.EMPLOYEE_SCHEMA_SOURCE_SHA)),
  }));
  return assertChatBinding({
    version: 1,
    sourceSha: env.EMPLOYEE_SCHEMA_SOURCE_SHA,
    controlSha: env.EMPLOYEE_SCHEMA_CONTROL_SHA,
    runId: env.GITHUB_RUN_ID,
    migration: { path: chatMigration, sha256: fixtureHashes[0].sha256 },
    fixtureHashes,
    controlHashes: chatControlFiles.map((file) => ({
      path: file,
      sha256: sha256(
        trackedBytes(controlRoot, file, env.EMPLOYEE_SCHEMA_CONTROL_SHA)
      ),
    })),
  });
}
export function sqlJson(result, committed = false) {
  if (
    result.status !== 0 ||
    typeof result.stdout !== 'string' ||
    Buffer.byteLength(result.stdout) > 1024 * 1024
  )
    throw new Error('Chat SQL process failed');
  const lines = result.stdout.trim().split(/\r?\n/);
  const payloads = lines.filter((line) => line.startsWith('{'));
  if (
    payloads.length !== 1 ||
    (committed && lines.filter((line) => line === 'COMMIT').length !== 1)
  )
    throw new Error('Chat SQL output missing unique committed payload');
  if (
    lines.some(
      (line) =>
        !line.startsWith('{') &&
        !/^(?:BEGIN|COMMIT|SET|DO|CREATE TABLE|INSERT 0 [0-9]+|UPDATE [0-9]+|SELECT [0-9]+)$/.test(
          line
        )
    )
  )
    throw new Error('Unexpected chat SQL output');
  return JSON.parse(payloads[0]);
}
export function fixtureCleanupSql(marker) {
  if (!/^[a-f0-9-]{36}$/.test(marker))
    throw new Error('Invalid chat owner marker');
  return `begin;
  create temporary table bridge_cleanup_workspaces as
   select id,creator_id,personal from public.workspaces
   where name='chat-bridge-${marker}' and creator_id in
    ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002');
  do $$ declare owned integer; begin
   select count(*) into owned from bridge_cleanup_workspaces;
   if owned=3 and
    (select count(distinct creator_id) from bridge_cleanup_workspaces where personal)=2 and
    exists(select 1 from bridge_cleanup_workspaces where
     id='b6277131-0000-4000-8000-000000000011' and not personal and
     creator_id='b6277131-0000-4000-8000-000000000001') and
    (select count(*) from public.workspaces where creator_id in
     ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002'))=3 then
    delete from private.chat_conversations where ws_id in(select id from bridge_cleanup_workspaces);
    delete from public.workspaces where id in(select id from bridge_cleanup_workspaces)
     and name='chat-bridge-${marker}';
    delete from public.users where id in
     ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002');
   elsif owned<>0 then raise exception 'chat_bridge_cleanup_owner_mismatch';
   end if;
  end $$;
  commit;
  select jsonb_build_object('fixtureClean',
   not exists(select 1 from public.workspaces where name='chat-bridge-${marker}' or
    id='b6277131-0000-4000-8000-000000000011' or creator_id in
    ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002'))
   and not exists(select 1 from public.users where id in
    ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002'))
   and not exists(select 1 from private.chat_conversations
    where ws_id in(select id from bridge_cleanup_workspaces)));
  `;
}
function boundedJson(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('Chat artifact exceeds bound');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}
function processReceipt(result, withOutput = false, withDart = false) {
  const receipt = {
    status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal ?? null,
    timedOut: result.timedOut === true,
    processGroupStopped: result.processGroupStopped === true,
  };
  if (withOutput) {
    receipt.outputDiagnostic = null;
    receipt.outputDiagnosticValid = false;
    try {
      receipt.outputDiagnostic = projectProcessOutput(
        result.buildDiagnostic?.processOutput
      );
      receipt.outputDiagnosticValid = true;
    } catch {
      // Keep the actual exit/cleanup evidence; an invalid summary cannot qualify.
    }
  }
  if (withDart) {
    receipt.dartTestDiagnostic = null;
    receipt.dartTestDiagnosticValid = false;
    try {
      receipt.dartTestDiagnostic = projectDartTestDiagnostic(
        result.buildDiagnostic?.dartTest
      );
      receipt.dartTestDiagnosticValid = true;
    } catch {
      /* Preserve actual child failure even when diagnostics are invalid. */
    }
  }
  return receipt;
}
function assertChild(result) {
  if (
    result.status !== 0 ||
    result.timedOut ||
    result.signal ||
    result.processGroupStopped !== true
  )
    throw new Error('Owned chat bridge child failed or remains');
}

function webArtifacts(
  reportPath,
  resultPath,
  envelopePath,
  binding,
  sql,
  envelopeHash
) {
  if (sha256(readFileSync(envelopePath)) !== envelopeHash)
    throw new Error('Chat immutable SQL envelope changed');
  assertVitestReport(boundedJson(reportPath));
  const result = boundedJson(resultPath);
  assertPhaseResult(result, binding, webCaseNames, envelopeHash);
  if (
    !Array.isArray(result.cases) ||
    result.cases.length !== 4 ||
    !result.cases.every((item, i) =>
      isDeepStrictEqual(
        Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== 'response')
        ),
        sql.cases[i]
      )
    )
  )
    throw new Error('Web changed actual SQL envelope');
  return {
    reportSha256: sha256(readFileSync(reportPath)),
    resultSha256: sha256(readFileSync(resultPath)),
  };
}
function diagnosticProcess(result) {
  const receipt = processReceipt(result, true);
  if (
    ![
      'SIGABRT',
      'SIGTERM',
      'SIGKILL',
      'SIGSEGV',
      'SIGBUS',
      'SIGILL',
      'SIGFPE',
      null,
    ].includes(receipt.signal) ||
    (receipt.status !== null &&
      (!Number.isInteger(receipt.status) ||
        receipt.status < 0 ||
        receipt.status > 255))
  )
    throw new Error('Chat diagnostic process status invalid');
  return receipt;
}

// The caller owns one already-running database and finally stops that exact owner.
// Child stdout is bounded diagnostic capture; qualification uses actual files + exits.
export async function runChatInitialSettingsBridge({
  root,
  receiptDirectory,
  binding,
  runSQL,
  state,
  runProcess = runOwnedSessionProcess,
  diagnoseChatProcess = false,
  processContext = chatProcessContext,
}) {
  assertChatBinding(binding);
  const marker = randomUUID();
  const envelopePath = path.join(receiptDirectory, 'chat-sql-envelope.json');
  const webPath = path.join(receiptDirectory, 'chat-web-result.json');
  const dartPath = path.join(receiptDirectory, 'chat-dart-result.json');
  const webReportPath = path.join(receiptDirectory, 'chat-web-tests.json');
  const env = {
    ...process.env,
    CHAT_INITIAL_SETTINGS_ENVELOPE: envelopePath,
    CHAT_INITIAL_SETTINGS_WEB_RESULT: webPath,
    CHAT_INITIAL_SETTINGS_DART_RESULT: dartPath,
  };
  delete env.CHAT_PROCESS_DIAGNOSTIC_ARM;
  delete env.CHAT_PROCESS_DIAGNOSTIC_DIRECTORY;
  delete env.CHAT_PROCESS_PARENT_PID;
  const failures = [];
  let context;
  const identity = (arm, result) =>
    readChatArmIdentity({
      directory: receiptDirectory,
      arm,
      binding,
      context,
      envelopeSha256: state.envelopeSha256,
      processId: result.diagnosticProcessId,
    });
  const armEnv = (arm) => ({
    ...env,
    CHAT_PROCESS_DIAGNOSTIC_ARM: arm,
    CHAT_PROCESS_DIAGNOSTIC_DIRECTORY: receiptDirectory,
    CHAT_PROCESS_PARENT_PID: String(context.parentPid),
  });
  async function comparison(original, sql) {
    const diagnostic = state.processDiagnostic;
    diagnostic.failureCode = 'original-evidence-invalid';
    webArtifacts(
      webReportPath,
      webPath,
      envelopePath,
      binding,
      sql,
      state.envelopeSha256
    );
    if (!diagnostic.original.outputDiagnosticValid)
      throw new Error('Chat original output invalid');
    diagnostic.originalIdentity = identity('original', original);
    diagnostic.attempted = true;
    diagnostic.failureCode = 'comparison-launch-failed';
    const report = path.join(
      receiptDirectory,
      'chat-comparison-web-tests.json'
    );
    const resultPath = path.join(
      receiptDirectory,
      'chat-comparison-web-result.json'
    );
    state.processesStopped = false;
    const result = await runProcess(
      context.nodePath,
      [
        context.binPath,
        'run',
        '--config',
        'e2e/fixtures/vitest.chat-initial-settings.config.ts',
        '--reporter=json',
        '--outputFile',
        report,
      ],
      {
        cwd: path.join(root, 'apps/web'),
        env: {
          ...armEnv('direct-node'),
          CHAT_INITIAL_SETTINGS_WEB_RESULT: resultPath,
        },
        timeoutMs: 120000,
        buildOutput: true,
        diagnosticIdentity: true,
      }
    );
    state.processesStopped =
      original.processGroupStopped === true &&
      result.processGroupStopped === true;
    diagnostic.comparison = diagnosticProcess(result);
    diagnostic.failureCode = 'comparison-identity-invalid';
    diagnostic.comparisonIdentity = identity('direct-node', result);
    if (
      ['config', 'fixture'].some(
        (role) =>
          diagnostic.originalIdentity[role].entrySha256 !==
          diagnostic.comparisonIdentity[role].entrySha256
      )
    )
      throw new Error('Chat actual entry identity changed between arms');
    diagnostic.identityAgreement = true;
    diagnostic.failureCode = 'comparison-child-failed';
    assertChild(result);
    if (!diagnostic.comparison.outputDiagnosticValid)
      throw new Error('Chat comparison output invalid');
    diagnostic.failureCode = 'comparison-artifacts-invalid';
    diagnostic.comparisonArtifacts = webArtifacts(
      report,
      resultPath,
      envelopePath,
      binding,
      sql,
      state.envelopeSha256
    );
    diagnostic.validComparison = true;
    diagnostic.failureCode = null;
  }
  try {
    if (typeof diagnoseChatProcess !== 'boolean')
      throw new Error('Chat diagnostic selection invalid');
    context = assertChatProcessContext(processContext(root));
    if (diagnoseChatProcess) {
      state.processDiagnostic = {
        version: 1,
        selected: true,
        sourceSha: binding.sourceSha,
        controlSha: binding.controlSha,
        runId: binding.runId,
        bindingSha256: sha256(JSON.stringify(binding)),
        parentPid: context.parentPid,
        parentRuntime: context.runtime,
        attempted: false,
        identityAgreement: false,
        validComparison: false,
        original: null,
        comparison: null,
        failureCode: null,
      };
    }
    state.phase = 'sql-producer';
    const sqlSource = readFileSync(path.join(root, chatFiles[2]), 'utf8');
    if (sha256(sqlSource) !== binding.fixtureHashes[2].sha256)
      throw new Error('SQL bridge fixture hash differs');
    const sql = assertSqlEnvelope(
      sqlJson(
        await runSQL(
          sqlSource.replaceAll('_CHAT_BRIDGE_MARKER_', marker),
          60000
        ),
        true
      )
    );
    const envelope = JSON.stringify({ binding, sql });
    state.envelopeSha256 = sha256(envelope);
    writeFileSync(envelopePath, envelope, { flag: 'wx', mode: 0o600 });
    state.phase = 'web';
    state.processesStopped = false;
    const webProcess = await runProcess(
      context.nodePath,
      [
        context.binPath,
        'run',
        '--config',
        'e2e/fixtures/vitest.chat-initial-settings.config.ts',
        '--reporter=json',
        '--outputFile',
        webReportPath,
      ],
      {
        cwd: path.join(root, 'apps/web'),
        env: diagnoseChatProcess ? armEnv('original') : env,
        ...(diagnoseChatProcess ? { diagnosticIdentity: true } : {}),
        timeoutMs: 120000,
        buildOutput: true,
      }
    );
    state.webProcess = processReceipt(webProcess, true);
    state.processesStopped = webProcess.processGroupStopped === true;
    try {
      assertChild(webProcess);
    } catch (primary) {
      if (diagnoseChatProcess) {
        state.processDiagnostic.failureCode = 'original-not-eligible';
        try {
          state.processDiagnostic.original = diagnosticProcess(webProcess);
          if (
            webProcess.status === null &&
            webProcess.signal === 'SIGABRT' &&
            webProcess.timedOut === false &&
            webProcess.processGroupStopped === true
          )
            await comparison(webProcess, sql);
        } catch {
          /* Diagnostic failure cannot replace the authoritative original error. */
        }
      }
      throw primary;
    }
    if (diagnoseChatProcess) {
      state.processDiagnostic.original = diagnosticProcess(webProcess);
      state.processDiagnostic.originalIdentity = identity(
        'original',
        webProcess
      );
    }
    if (!state.webProcess.outputDiagnosticValid)
      throw new Error('Chat process output summary unavailable');
    const artifacts = webArtifacts(
      webReportPath,
      webPath,
      envelopePath,
      binding,
      sql,
      state.envelopeSha256
    );
    state.webTestReportSha256 = artifacts.reportSha256;
    state.webResultSha256 = artifacts.resultSha256;
    state.webPassed = true;
    state.phase = 'dart';
    const webStopped = state.processesStopped;
    state.processesStopped = false;
    const dartProcess = await runProcess(
      'flutter',
      [
        'test',
        '--no-pub',
        '--concurrency=1',
        '--reporter=json',
        'tool/qualification/chat_initial_settings_bridge_test.dart',
      ],
      {
        cwd: path.join(root, 'apps/mobile'),
        env,
        timeoutMs: 180000,
        buildOutput: true,
        dartTestOutput: true,
      }
    );
    state.dartProcess = processReceipt(dartProcess, true, true);
    state.processesStopped =
      webStopped && dartProcess.processGroupStopped === true;
    assertChild(dartProcess);
    assertPhaseResult(
      boundedJson(dartPath),
      binding,
      dartCaseNames,
      state.envelopeSha256
    );
    state.dartResultSha256 = sha256(readFileSync(dartPath));
    state.dartPassed = true;
    state.completed = true;
  } catch (error) {
    state.failurePhase = state.phase;
    failures.push(error);
  } finally {
    try {
      const cleanup = sqlJson(
        await runSQL(fixtureCleanupSql(marker), 60000),
        true
      );
      state.fixtureCleanup = cleanup.fixtureClean === true;
      if (!state.fixtureCleanup)
        failures.push(new Error('Owned committed chat fixture remains'));
    } catch (error) {
      state.fixtureCleanup = false;
      failures.push(error);
    }
    if (!state.fixtureCleanup) state.failurePhase ??= 'fixture-cleanup';
  }
  if (diagnoseChatProcess && state.processDiagnostic) {
    state.processDiagnostic.fixtureCleanup = state.fixtureCleanup === true;
    state.processDiagnostic.processesStopped = state.processesStopped === true;
    if (!state.fixtureCleanup || !state.processesStopped) {
      state.processDiagnostic.validComparison = false;
      state.processDiagnostic.failureCode ??= 'diagnostic-cleanup-incomplete';
    }
    try {
      writeChatProcessDiagnostic(receiptDirectory, state.processDiagnostic);
    } catch {
      state.processDiagnostic.validComparison = false;
      state.processDiagnostic.failureCode = 'diagnostic-receipt-failed';
      state.failurePhase ??= 'process-diagnostic';
      failures.push(new Error('Chat process diagnostic receipt unavailable'));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      'Chat bridge and fixture cleanup failed',
      {
        cause: failures[0],
      }
    );
}
