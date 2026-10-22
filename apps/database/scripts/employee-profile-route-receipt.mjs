import { projectBuildDiagnostic } from './employee-web-session-build-diagnostic.mjs';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';
import { projectStartupOutput } from './employee-web-session-startup-diagnostic.mjs';

export const profileRouteCases = Object.freeze(
  ['managed', 'unmanaged'].flatMap((mode) =>
    [
      'anonymous',
      'malformed-bearer',
      'owned-hehe',
      'competitor',
      'root-revoked',
      'banned',
      'aal1-policy',
      'totp',
      'mfa-invalidated',
    ].map((name) => `${mode}/${name}`)
  )
);
export function createProfileRouteProgress() {
  let currentCase = null;
  let assertions = 0;
  let assertionsAtStart = 0;
  const cases = [];
  return {
    /** @param {{kind: 'assertion'} | {kind: 'start' | 'complete', name: string}} event */
    checkpoint(event) {
      if (event.kind === 'assertion') {
        if (assertions >= 500) fail();
        assertions++;
        return;
      }
      if (event.kind === 'start') {
        if (
          currentCase !== null ||
          event.name !== profileRouteCases[cases.length]
        )
          fail();
        currentCase = event.name;
        assertionsAtStart = assertions;
        return;
      }
      if (
        event.kind !== 'complete' ||
        currentCase === null ||
        event.name !== currentCase ||
        assertions <= assertionsAtStart
      )
        fail();
      cases.push(currentCase);
      currentCase = null;
    },
    snapshot() {
      return { currentCase, assertions, cases: [...cases] };
    },
  };
}
export function selectProfileRouteRuntime(value, selections) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid profile route qualification selection');
  if (value !== 'true') return false;
  if (
    ['JOURNAL', 'HTTP', 'MANAGED_PROFILE'].some(
      (key) => selections[key] !== 'true'
    ) ||
    ['PERSONAL_JOURNAL', 'CHAT_INITIAL_SETTINGS', 'STRUCTURED_PROVENANCE'].some(
      (key) => selections[key] === 'true'
    )
  )
    throw new Error(
      'Profile route qualification requires journal, HTTP and managed profile'
    );
  return true;
}
function fail() {
  throw new Error('Profile route receipt invalid');
}
const phases = [
  'configuration',
  'build',
  'start',
  'cases',
  'cleanup',
  'complete',
];
function projectFailure(value, phase) {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.phase !== phase ||
    phase === 'complete' ||
    !['process', 'assertion', 'validation', 'timeout', 'unknown'].includes(
      value.kind
    ) ||
    !(
      value.exitCode === null ||
      (Number.isInteger(value.exitCode) &&
        value.exitCode >= 0 &&
        value.exitCode <= 255)
    ) ||
    ![null, 'SIGTERM', 'SIGKILL', 'other'].includes(value.signal) ||
    typeof value.timedOut !== 'boolean'
  )
    fail();
  return {
    phase,
    kind: value.kind,
    exitCode: value.exitCode,
    signal: value.signal,
    timedOut: value.timedOut,
    ...(value.buildDiagnostic === undefined
      ? {}
      : {
          buildDiagnostic: projectBuildDiagnostic(value.buildDiagnostic),
        }),
  };
}
export function parseProfileRouteReceipt(text) {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 8192) fail();
    const value = JSON.parse(text);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.version !== 1 ||
      typeof value.qualified !== 'boolean' ||
      !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
      value.sourceSha === '0'.repeat(40) ||
      !phases.includes(value.phase) ||
      value.productionProof !== false ||
      value.routeAuthorizationProof !== value.qualified ||
      typeof value.serverStopped !== 'boolean' ||
      !Number.isInteger(value.assertions) ||
      value.assertions < 0 ||
      value.assertions > 500 ||
      !Array.isArray(value.cases) ||
      value.cases.length > profileRouteCases.length ||
      value.cases.some((name, index) => name !== profileRouteCases[index]) ||
      !(
        value.currentCase === null ||
        value.currentCase === profileRouteCases[value.cases.length]
      )
    )
      fail();
    if (
      value.assertions < value.cases.length ||
      (!['cases', 'cleanup', 'complete'].includes(value.phase) &&
        (value.currentCase !== null ||
          value.cases.length !== 0 ||
          value.assertions !== 0))
    )
      fail();
    const failure = projectFailure(value.failure, value.phase);
    let cleanup = null;
    if (value.cleanup !== null) {
      const raw = value.cleanup;
      if (
        !raw ||
        !['stopped', 'failed'].includes(raw.server) ||
        !['closed', 'failed'].includes(raw.proxy)
      )
        fail();
      for (const [status, error, good] of [
        [raw.server, raw.serverError, 'stopped'],
        [raw.proxy, raw.proxyError, 'closed'],
      ]) {
        if (
          ![null, 'not-running', 'type-error', 'timeout', 'unknown'].includes(
            error
          ) ||
          (status === good) !== (error === null)
        )
          fail();
      }
      cleanup = {
        server: raw.server,
        proxy: raw.proxy,
        serverError: raw.serverError,
        proxyError: raw.proxyError,
      };
    }
    if (
      value.serverStopped !==
      (cleanup?.server === 'stopped' && cleanup?.proxy === 'closed')
    )
      fail();
    let startup = null;
    if (value.startup !== null) {
      const raw = value.startup;
      if (
        !raw ||
        !Number.isInteger(raw.attempts) ||
        raw.attempts < 0 ||
        raw.attempts > 60 ||
        !(
          raw.status === null ||
          (Number.isInteger(raw.status) &&
            raw.status >= 100 &&
            raw.status <= 599)
        ) ||
        typeof raw.ready !== 'boolean' ||
        (raw.ready && (raw.status !== 401 || raw.attempts === 0))
      )
        fail();
      startup = {
        attempts: raw.attempts,
        status: raw.status,
        ready: raw.ready,
      };
    }
    if (
      value.qualified &&
      (value.phase !== 'complete' ||
        failure !== null ||
        !value.serverStopped ||
        !startup?.ready ||
        value.currentCase !== null ||
        value.cases.length !== profileRouteCases.length ||
        value.assertions < profileRouteCases.length)
    )
      fail();
    if (!value.qualified && failure === null) fail();
    return {
      version: 1,
      qualified: value.qualified,
      sourceSha: value.sourceSha,
      phase: value.phase,
      currentCase: value.currentCase,
      assertions: value.assertions,
      cases: value.cases,
      serverStopped: value.serverStopped,
      failure,
      cleanup,
      startup,
      startupOutput:
        value.startupOutput === null
          ? null
          : projectStartupOutput(value.startupOutput),
      routeAuthorizationProof: value.routeAuthorizationProof,
      productionProof: false,
    };
  } catch {
    fail();
  }
}
export function assertQualifiedProfileRoute(
  value,
  status,
  sourceSha,
  processGroupStopped
) {
  const parsed = parseProfileRouteReceipt(JSON.stringify(value));
  if (
    status !== 0 ||
    !parsed.qualified ||
    parsed.sourceSha !== sourceSha ||
    processGroupStopped !== true ||
    !value.routeAuthorizationProof ||
    value.productionProof !== false
  )
    throw new Error(
      'Authenticated Infrastructure profile route qualification incomplete'
    );
}
const selected = selectProfileRouteRuntime(
  process.env.EMPLOYEE_SCHEMA_INCLUDE_PROFILE_ROUTE,
  Object.fromEntries(
    [
      'JOURNAL',
      'HTTP',
      'MANAGED_PROFILE',
      'PERSONAL_JOURNAL',
      'CHAT_INITIAL_SETTINGS',
      'STRUCTURED_PROVENANCE',
    ].map((key) => [key, process.env[`EMPLOYEE_SCHEMA_INCLUDE_${key}`]])
  )
);
let qualification = null;
export async function run({ root, status, metadata, sourceSha }) {
  if (!selected) return;
  const output = await runOwnedSessionProcess(
    'bun',
    [
      '--conditions=react-server',
      'apps/infrastructure/e2e/fixtures/employee-profile-route-runtime.ts',
    ],
    {
      cwd: root,
      timeoutMs: 1500000,
      input: JSON.stringify({
        url: status.API_URL,
        key: status.SERVICE_ROLE_KEY,
        anonKey: status.ANON_KEY,
        projectId: metadata.projectId,
        basePort: metadata.basePort,
        sourceSha,
      }),
    }
  );
  qualification = parseProfileRouteReceipt(output.stdout.trim());
  qualification.processGroupStopped = output.processGroupStopped;
  assertQualifiedProfileRoute(
    qualification,
    output.status,
    sourceSha,
    output.processGroupStopped
  );
}
export function receipt(lifecycleCode, cleanupSucceeded) {
  if (!selected) return null;
  const qualified =
    lifecycleCode === 0 &&
    cleanupSucceeded &&
    qualification?.qualified === true &&
    qualification?.processGroupStopped === true;
  return {
    ...qualification,
    qualified,
    databaseCleanup: cleanupSucceeded,
    routeAuthorizationProof: qualified,
    productionProof: false,
  };
}
