import { createHash } from 'node:crypto';
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
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
    !binding ||
    binding.version !== 1 ||
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
  const actors = ['b6277131-0000-4000-8000-000000000001',
    'b6277131-0000-4000-8000-000000000002'];
  const shared = 'b6277131-0000-4000-8000-000000000011';
  const workspaces = envelope?.fixtureWorkspaces;
  if (!Array.isArray(workspaces) || workspaces.length !== 3 ||
    new Set(workspaces.map((item) => item?.id)).size !== 3 ||
    !workspaces.every((item) => item &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.id ?? '') &&
      (item.personal === true && item.creatorMember === true && actors.includes(item.creatorId) ||
       item.personal === false && item.id === shared && item.creatorId === actors[0])) ||
    !actors.every((actor) => workspaces.filter((item) => item.personal && item.creatorId === actor).length === 1))
    throw new Error('SQL trigger-created workspace ownership differs');
  return workspaces.find((item) => item.personal && item.creatorId === actors[1]).id;
}

export function assertSqlEnvelope(envelope) {
  const personalWsId = fixturePersonalWorkspace(envelope);
  if (
    !envelope ||
    envelope.version !== 1 ||
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
        (item.name !== 'personal' || item.input?.initialAiSettings?.creditWsId === personalWsId) &&
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
  };
}
