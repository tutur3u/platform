import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const chatMigration =
  'apps/database/supabase/migrations/20261018020000_chat_initial_ai_settings.sql';
export const chatFiles = Object.freeze([
  chatMigration,
  'apps/database/supabase/tests/chat-initial-ai-settings.sql',
  'apps/database/scripts/fixtures/chat-initial-settings-bridge.sql',
  'apps/web/e2e/fixtures/chat-initial-settings-bridge.test.ts',
  'apps/web/e2e/fixtures/vitest.chat-initial-settings.config.ts',
  'apps/web/e2e/fixtures/tsconfig.chat-initial-settings.json',
  'apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/route.ts',
  'apps/web/src/lib/chat/initial-ai-settings.ts',
  'apps/web/src/lib/chat/chat-timestamp.ts',
  'apps/mobile/tool/qualification/chat_initial_settings_bridge_test.dart',
  'apps/mobile/lib/features/chat/data/chat_creation_receipt.dart',
  'apps/mobile/lib/features/chat/data/chat_repository.dart',
  'apps/mobile/lib/features/chat/models/chat_initial_ai_settings.dart',
  'apps/database/supabase/migrations/20260527181237_create_private_chat_platform.sql',
  'apps/database/scripts/chat-initial-settings-qualification.mjs',
]);
export const chatControlFiles = Object.freeze([
  '.github/workflows/employee-schema-contract.yaml',
  'apps/database/scripts/chat-initial-settings-qualification.mjs',
  'apps/database/scripts/chat-initial-settings-runner.mjs',
  'apps/database/scripts/employee-schema-tap.mjs',
  'apps/database/scripts/verify-employee-schema-contract.mjs',
  'apps/database/scripts/employee-web-session-process.mjs',
]);
export const chatCaseNames = Object.freeze([
  'workspace',
  'personal',
  'null',
  'legacy',
]);
export const webCaseNames = Object.freeze([
  ...chatCaseNames,
  'invalid_calendar',
  'wrong_workspace',
  'wrong_tuple',
  'sql_denied',
  'route_denied',
]);
export const dartCaseNames = Object.freeze([
  ...chatCaseNames,
  'invalid_calendar',
  'wrong_workspace',
  'wrong_actor',
  'wrong_tuple',
  'raw_sql_requires_web',
]);
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const sha = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{40}$/.test(value) &&
  value !== '0'.repeat(40);
const hash = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function selectChatInitialSettings(value, options = {}) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid chat initial settings selection');
  const selected = value === 'true';
  if (
    selected &&
    Object.values(options).some(
      (flag) => flag !== false && flag !== undefined && flag !== 'false'
    )
  )
    throw new Error(
      'Chat initial settings requires standalone foundation; optional profiles and structured provenance are incompatible'
    );
  return selected;
}

export function assertChatBinding(binding, expected = binding) {
  if (
    binding?.version !== 1 ||
    !sha(binding.sourceSha) ||
    !sha(binding.controlSha) ||
    !/^[1-9][0-9]{0,19}$/.test(binding.runId ?? '') ||
    binding.migration?.path !== chatMigration ||
    !hash(binding.migration.sha256) ||
    !Array.isArray(binding.fixtureHashes) ||
    binding.fixtureHashes.length !== chatFiles.length ||
    !binding.fixtureHashes.every(
      (entry, index) => entry.path === chatFiles[index] && hash(entry.sha256)
    ) ||
    !Array.isArray(binding.controlHashes) ||
    binding.controlHashes.length !== chatControlFiles.length ||
    !binding.controlHashes.every(
      (entry, index) =>
        entry.path === chatControlFiles[index] && hash(entry.sha256)
    ) ||
    binding.migration.sha256 !== binding.fixtureHashes[0].sha256 ||
    !isDeepStrictEqual(binding, expected)
  )
    throw new Error('Chat source/control/run/hash binding differs');
  return binding;
}

function fixturePersonalWorkspace(envelope) {
  const actors = [
    'b6277131-0000-4000-8000-000000000001',
    'b6277131-0000-4000-8000-000000000002',
  ];
  const shared = 'b6277131-0000-4000-8000-000000000011';
  const workspaces = envelope?.fixtureWorkspaces;
  if (
    !Array.isArray(workspaces) ||
    workspaces.length !== 3 ||
    new Set(workspaces.map((item) => item?.id)).size !== 3 ||
    !workspaces.every(
      (item) =>
        item &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          item.id ?? ''
        ) &&
        ((item.personal === true &&
          item.creatorMember === true &&
          actors.includes(item.creatorId)) ||
          (item.personal === false &&
            item.id === shared &&
            item.creatorId === actors[0]))
    ) ||
    !actors.every(
      (actor) =>
        workspaces.filter((item) => item.personal && item.creatorId === actor)
          .length === 1
    )
  )
    throw new Error('SQL trigger-created workspace ownership differs');
  return workspaces.find(
    (item) => item.personal && item.creatorId === actors[1]
  ).id;
}

export function assertSqlEnvelope(envelope) {
  const personalWsId = fixturePersonalWorkspace(envelope);
  if (
    envelope?.version !== 1 ||
    envelope.committedReadback !== true ||
    envelope.migrationVersion !== '20261018020000' ||
    envelope.createAllowed !== true ||
    envelope.manageAllowed !== false ||
    envelope.deniedSqlstate !== '42501' ||
    envelope.deniedCreatedRows !== 0 ||
    !Array.isArray(envelope.cases) ||
    envelope.cases.length !== 4 ||
    !envelope.cases.every(
      (item, index) =>
        item.name === chatCaseNames[index] &&
        item.actorId === 'b6277131-0000-4000-8000-000000000002' &&
        item.wsId === 'b6277131-0000-4000-8000-000000000011' &&
        item.personalWsId === personalWsId &&
        (item.name !== 'personal' ||
          item.input?.initialAiSettings?.creditWsId === personalWsId) &&
        isDeepStrictEqual(item.receipt, item.readback)
    )
  )
    throw new Error('Actual SQL committed/readback envelope differs');
  return envelope;
}

export function assertPhaseResult(
  result,
  expectedBinding,
  names,
  expectedEnvelopeHash
) {
  assertChatBinding(result?.binding, expectedBinding);
  if (
    result.envelopeSha256 !== expectedEnvelopeHash ||
    !hash(expectedEnvelopeHash) ||
    !isDeepStrictEqual(result.passed, names) ||
    result.providerCalls !== 0
  )
    throw new Error('Chat bridge phase incomplete or envelope differs');
}

export function assertVitestReport(report) {
  if (
    report?.success !== true ||
    report.numTotalTests !== 9 ||
    report.numPassedTests !== 9 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    !Array.isArray(report.testResults) ||
    report.testResults.length !== 1 ||
    report.testResults[0].status !== 'passed' ||
    report.testResults[0].assertionResults?.length !== 9 ||
    !isDeepStrictEqual(
      report.testResults[0].assertionResults.map((result) => result.title),
      webCaseNames
    ) ||
    report.testResults[0].assertionResults.some(
      (result) => result.status !== 'passed'
    )
  )
    throw new Error('Actual Web test report incomplete');
}

export function chatQualificationReceipt({
  binding,
  envelopeSha256,
  webResultSha256,
  webTestReportSha256,
  dartResultSha256,
  webPassed,
  dartPassed,
  processesStopped,
  fixtureCleanup,
  databaseCleanup,
  lifecycleCode,
  webProcess = null,
  dartProcess = null,
  completed = false,
  failurePhase = null,
  processDiagnostic,
}) {
  assertChatBinding(binding);
  const processPassed = (result) =>
    result?.status === 0 &&
    result.signal === null &&
    result.timedOut === false &&
    result.processGroupStopped === true;
  const qualified =
    completed === true &&
    processPassed(webProcess) &&
    processPassed(dartProcess) &&
    [
      envelopeSha256,
      webResultSha256,
      webTestReportSha256,
      dartResultSha256,
    ].every(hash) &&
    webPassed === true &&
    dartPassed === true &&
    processesStopped === true &&
    fixtureCleanup === true &&
    databaseCleanup === true &&
    lifecycleCode === 0;
  return {
    version: 1,
    binding,
    envelopeSha256,
    webResultSha256,
    webTestReportSha256,
    dartResultSha256,
    webCases: webPassed ? 9 : 0,
    dartCases: dartPassed ? 9 : 0,
    webProcess,
    dartProcess,
    completed: completed === true,
    failurePhase,
    processesStopped: processesStopped === true,
    fixtureCleanup: fixtureCleanup === true,
    databaseCleanup: databaseCleanup === true,
    qualified,
    messagesQualified: false,
    providerQualified: false,
    productionApplied: false,
    ...(processDiagnostic ? { processDiagnostic } : {}),
  };
}

export function selectChatProcessDiagnostic(value, chatSelected) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid chat process diagnostic selection');
  if (value === 'true' && chatSelected !== true)
    throw new Error('Chat process diagnostic requires standalone chat');
  return value === 'true';
}

function validRuntime(value) {
  return (
    value &&
    isDeepStrictEqual(Object.keys(value).sort(), [
      'binSha256',
      'executableSha256',
      'kind',
      'nodeOptionsPresent',
      'nodeOptionsSha256',
      'nodeVersion',
      'runtimeVersion',
      'vitestVersion',
    ]) &&
    ['node', 'bun'].includes(value.kind) &&
    /^[0-9]{1,3}\.[0-9]{1,4}\.[0-9]{1,6}$/.test(value.nodeVersion) &&
    /^[0-9]{1,3}\.[0-9]{1,4}\.[0-9]{1,6}$/.test(value.runtimeVersion) &&
    hash(value.executableSha256) &&
    hash(value.binSha256) &&
    value.vitestVersion === '5.0.3' &&
    typeof value.nodeOptionsPresent === 'boolean' &&
    hash(value.nodeOptionsSha256)
  );
}
export function assertChatProcessContext(context) {
  if (
    !validRuntime(context?.runtime) ||
    context.runtime.kind !== 'node' ||
    !/^24\.[0-9]+\.[0-9]+$/.test(context.runtime.nodeVersion) ||
    context.runtime.runtimeVersion !== context.runtime.nodeVersion ||
    !Number.isSafeInteger(context.parentPid) ||
    context.parentPid <= 0 ||
    ![context.nodePath, context.binPath].every(
      (value) => typeof value === 'string' && value.length <= 4096
    )
  )
    throw new Error('Chat setup Node24 runtime differs');
  return context;
}

function fileDigest(file, limit = 256 * 1024 * 1024) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit)
      throw new Error('Chat identity input exceeds bound');
    const bytes = readFileSync(fd);
    if (bytes.length > limit)
      throw new Error('Chat identity input exceeds bound');
    return sha256(bytes);
  } finally {
    closeSync(fd);
  }
}

export function chatProcessContext(root) {
  const base = realpathSync(root);
  const require = createRequire(path.join(base, 'package.json'));
  const packagePath = require.resolve('vitest/package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  const declared = JSON.parse(
    readFileSync(path.join(base, 'package.json'), 'utf8')
  );
  const binPath = realpathSync(
    path.join(path.dirname(packagePath), 'vitest.mjs')
  );
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vitest;
  if (
    !['./vitest.mjs', 'vitest.mjs'].includes(bin) ||
    pkg.version !== '5.0.3' ||
    declared.devDependencies?.vitest !== pkg.version ||
    !binPath.startsWith(path.join(base, 'node_modules') + path.sep)
  )
    throw new Error('Chat source-owned locked Vitest entry differs');
  const nodeOptions = process.env.NODE_OPTIONS;
  if (nodeOptions && Buffer.byteLength(nodeOptions) > 8192)
    throw new Error('Chat runtime option exceeds bound');
  const context = {
    nodePath: process.execPath,
    binPath,
    parentPid: process.pid,
    runtime: {
      kind: process.versions.bun
        ? 'bun'
        : process.release.name === 'node'
          ? 'node'
          : 'unknown',
      nodeVersion: process.versions.node,
      runtimeVersion: process.versions.bun ?? process.versions.node,
      executableSha256: fileDigest(process.execPath),
      binSha256: fileDigest(binPath, 1024 * 1024),
      vitestVersion: pkg.version,
      nodeOptionsPresent: nodeOptions !== undefined,
      nodeOptionsSha256: sha256(nodeOptions ?? ''),
    },
  };
  if (!validRuntime(context.runtime))
    throw new Error('Chat runtime version invalid');
  return context;
}

function privateJson(file, value) {
  const dir = lstatSync(path.dirname(file));
  const bytes = JSON.stringify(value);
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid() ||
    (dir.mode & 0o777) !== 0o700 ||
    Buffer.byteLength(bytes) > 8192
  )
    throw new Error('Chat private diagnostic output invalid');
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
}

function safeIdentityJson(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > 2048
    )
      throw new Error('Chat private identity invalid');
    const bytes = readFileSync(fd);
    if (bytes.length > 2048)
      throw new Error('Chat private identity exceeds bound');
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

export function writeChatProcessIdentity(role, root) {
  const arm = process.env.CHAT_PROCESS_DIAGNOSTIC_ARM;
  if (arm === undefined) return;
  if (
    !['config', 'fixture'].includes(role) ||
    !['original', 'direct-node'].includes(arm)
  )
    throw new Error('Chat process identity role invalid');
  const directory = process.env.CHAT_PROCESS_DIAGNOSTIC_DIRECTORY;
  const envelopeBytes = readFileSync(
    process.env.CHAT_INITIAL_SETTINGS_ENVELOPE
  );
  if (envelopeBytes.length > 1024 * 1024)
    throw new Error('Chat identity envelope bound');
  const binding = assertChatBinding(
    JSON.parse(envelopeBytes.toString('utf8')).binding
  );
  const context = chatProcessContext(root);
  const entry = realpathSync(process.argv[1]);
  if (
    !entry.startsWith(
      path.join(realpathSync(root), 'node_modules') + path.sep
    ) ||
    (role === 'config' && entry !== context.binPath)
  )
    throw new Error('Chat actual source entry differs');
  const entrySha256 = fileDigest(entry, 1024 * 1024);
  const parentPid = Number(process.env.CHAT_PROCESS_PARENT_PID);
  const ancestors = [];
  const digests = new Map();
  let pid = process.pid;
  for (let i = 0; i < 8; i++) {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    if (Buffer.byteLength(status) > 8192)
      throw new Error('Chat process status bound');
    const ppid = Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]);
    const executable = realpathSync(`/proc/${pid}/exe`);
    if (!digests.has(executable))
      digests.set(executable, fileDigest(executable));
    ancestors.push({ pid, ppid, executableSha256: digests.get(executable) });
    if (pid === parentPid) break;
    if (!Number.isSafeInteger(ppid) || ppid <= 0)
      throw new Error('Chat process parent missing');
    pid = ppid;
  }
  const identity = {
    version: 1,
    arm,
    role,
    sourceSha: binding.sourceSha,
    controlSha: binding.controlSha,
    runId: binding.runId,
    bindingSha256: sha256(JSON.stringify(binding)),
    envelopeSha256: sha256(envelopeBytes),
    runtime: context.runtime,
    entrySha256,
    ancestors,
  };
  if (Buffer.byteLength(JSON.stringify(identity)) > 2048)
    throw new Error('Chat process identity exceeds bound');
  privateJson(
    path.join(directory, `chat-process-${arm}-${role}.json`),
    identity
  );
}

export function readChatArmIdentity({
  directory,
  arm,
  binding,
  envelopeSha256,
  context,
  processId,
}) {
  assertChatProcessContext(context);
  if (
    !['original', 'direct-node'].includes(arm) ||
    !Number.isSafeInteger(processId) ||
    processId <= 0
  )
    throw new Error('Chat Node24 runtime identity unavailable');
  return Object.fromEntries(
    ['config', 'fixture'].map((role) => {
      const value = safeIdentityJson(
        path.join(directory, `chat-process-${arm}-${role}.json`)
      );
      const expected = {
        version: 1,
        arm,
        role,
        sourceSha: binding.sourceSha,
        controlSha: binding.controlSha,
        runId: binding.runId,
        bindingSha256: sha256(JSON.stringify(binding)),
        envelopeSha256,
        runtime: context.runtime,
        entrySha256: value.entrySha256,
        ancestors: value.ancestors,
      };
      if (
        !isDeepStrictEqual(value, expected) ||
        !hash(value.entrySha256) ||
        (role === 'config' &&
          value.entrySha256 !== context.runtime.binSha256) ||
        !Array.isArray(value.ancestors) ||
        value.ancestors.length < 1 ||
        value.ancestors.length > 8 ||
        new Set(value.ancestors.map((entry) => entry.pid)).size !==
          value.ancestors.length ||
        value.ancestors[0].executableSha256 !==
          context.runtime.executableSha256 ||
        !value.ancestors.every(
          (entry, i) =>
            isDeepStrictEqual(Object.keys(entry).sort(), [
              'executableSha256',
              'pid',
              'ppid',
            ]) &&
            Number.isSafeInteger(entry.pid) &&
            entry.pid > 0 &&
            Number.isSafeInteger(entry.ppid) &&
            entry.ppid >= 0 &&
            hash(entry.executableSha256) &&
            (i === 0 || value.ancestors[i - 1].ppid === entry.pid)
        ) ||
        !value.ancestors.some((entry) => entry.pid === processId) ||
        value.ancestors.at(-1).pid !== context.parentPid ||
        value.ancestors.at(-1).executableSha256 !==
          context.runtime.executableSha256
      )
        throw new Error('Chat actual process identity differs');
      return [role, value];
    })
  );
}

export function writeChatProcessDiagnostic(directory, value) {
  privateJson(path.join(directory, 'chat-process-diagnostic.json'), value);
}
