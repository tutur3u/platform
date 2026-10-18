import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  assertChatBinding,
  assertPhaseResult,
  assertSqlEnvelope,
  assertVitestReport,
  chatControlFiles,
  chatFiles,
  chatMigration,
  dartCaseNames,
  sha256,
  webCaseNames,
} from './chat-initial-settings-qualification.mjs';
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
  if (statSync(file).size > 1024 * 1024)
    throw new Error('Chat artifact exceeds bound');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function processReceipt(result) {
  return {
    status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal ?? null,
    timedOut: result.timedOut === true,
    processGroupStopped: result.processGroupStopped === true,
  };
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

// The caller owns one already-running database and finally stops that exact owner.
// Child stdout is bounded diagnostic capture; qualification uses actual files + exits.
export async function runChatInitialSettingsBridge({
  root,
  receiptDirectory,
  binding,
  runSQL,
  state,
  runProcess = runOwnedSessionProcess,
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
  const failures = [];
  try {
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
      'bun',
      [
        'x',
        'vitest',
        'run',
        '--config',
        'e2e/fixtures/vitest.chat-initial-settings.config.ts',
        '--reporter=json',
        '--outputFile',
        webReportPath,
      ],
      {
        cwd: path.join(root, 'apps/web'),
        env,
        timeoutMs: 120000,
        buildOutput: true,
      }
    );
    state.webProcess = processReceipt(webProcess);
    state.processesStopped = webProcess.processGroupStopped === true;
    assertChild(webProcess);
    assertVitestReport(boundedJson(webReportPath));
    state.webTestReportSha256 = sha256(readFileSync(webReportPath));
    const webResult = boundedJson(webPath);
    assertPhaseResult(webResult, binding, webCaseNames, state.envelopeSha256);
    if (
      !Array.isArray(webResult.cases) ||
      webResult.cases.length !== 4 ||
      !webResult.cases.every((item, i) =>
        isDeepStrictEqual(
          Object.fromEntries(
            Object.entries(item).filter(([key]) => key !== 'response')
          ),
          sql.cases[i]
        )
      )
    )
      throw new Error('Web changed actual SQL envelope');
    state.webResultSha256 = sha256(readFileSync(webPath));
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
        '--reporter=expanded',
        'tool/qualification/chat_initial_settings_bridge_test.dart',
      ],
      {
        cwd: path.join(root, 'apps/mobile'),
        env,
        timeoutMs: 180000,
        buildOutput: true,
      }
    );
    state.dartProcess = processReceipt(dartProcess);
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
