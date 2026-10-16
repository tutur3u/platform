import { projectBuildDiagnostic } from './employee-web-session-build-diagnostic.mjs';
export const sessionCases = Object.freeze([
  'anonymous',
  'malformed-bearer',
  'bearer-session',
  'ssr-cookie',
  'satellite-cookie',
  'wrong-app',
  'expired-app',
  'tampered-app',
  'canonical-domain',
  'non-root',
  'permission-revoked',
  'membership-revoked',
  'inactive-actor',
  'session-revoked',
  'origin',
  'fetch-site',
  'action-header',
  'self-action',
  'create',
  'restore',
  'restore-replay',
  'lost-provider-ack',
  'unknown-reconcile',
  'revoked-before-provider',
]);

export function selectWebSessionRuntime(value, http) {
  if (
    ![undefined, 'false', 'true'].includes(value) ||
    (value === 'true' && !http)
  )
    throw new Error('Web session qualification requires HTTP qualification');
  return value === 'true';
}

const phases = [
  'configuration',
  'build',
  'start',
  'cases',
  'cleanup',
  'complete',
];
function cleanupDiagnostics(cleanup) {
  if (cleanup.serverError === undefined && cleanup.proxyError === undefined)
    return {};
  for (const [status, error, success] of [
    [cleanup.server, cleanup.serverError, 'stopped'],
    [cleanup.proxy, cleanup.proxyError, 'closed'],
  ]) {
    if (
      ![null, 'not-running', 'type-error', 'timeout', 'unknown'].includes(
        error
      ) ||
      (status === success) !== (error === null)
    )
      throw 0;
  }
  return { serverError: cleanup.serverError, proxyError: cleanup.proxyError };
}
function diagnosticFields(value) {
  if (value.failure === undefined && value.cleanup === undefined) return {};
  const failure = value.failure;
  const cleanup = value.cleanup;
  if (
    failure !== null &&
    (!failure ||
      typeof failure !== 'object' ||
      Array.isArray(failure) ||
      !phases.includes(failure.phase) ||
      failure.phase === 'complete' ||
      !['process', 'assertion', 'validation', 'timeout', 'unknown'].includes(
        failure.kind
      ) ||
      !(
        failure.exitCode === null ||
        (Number.isInteger(failure.exitCode) &&
          failure.exitCode >= 0 &&
          failure.exitCode <= 255)
      ) ||
      ![null, 'SIGTERM', 'SIGKILL', 'other'].includes(failure.signal) ||
      typeof failure.timedOut !== 'boolean' ||
      failure.phase !== value.phase ||
      value.qualified)
  )
    throw 0;
  if (
    cleanup !== null &&
    (!cleanup ||
      typeof cleanup !== 'object' ||
      Array.isArray(cleanup) ||
      !['stopped', 'failed'].includes(cleanup.server) ||
      !['closed', 'failed'].includes(cleanup.proxy) ||
      value.serverStopped !==
        (cleanup.server === 'stopped' && cleanup.proxy === 'closed'))
  )
    throw 0;
  if (
    (value.qualified && (failure !== null || cleanup === null)) ||
    (!value.qualified && failure === null) ||
    (cleanup === null && value.serverStopped)
  )
    throw 0;
  return {
    failure:
      failure === null
        ? null
        : {
            ...(failure.buildDiagnostic === undefined
              ? {}
              : {
                  buildDiagnostic: projectBuildDiagnostic(
                    failure.buildDiagnostic
                  ),
                }),
            phase: failure.phase,
            kind: failure.kind,
            exitCode: failure.exitCode,
            signal: failure.signal,
            timedOut: failure.timedOut,
          },
    cleanup:
      cleanup === null
        ? null
        : {
            server: cleanup.server,
            proxy: cleanup.proxy,
            ...cleanupDiagnostics(cleanup),
          },
  };
}

export function webSessionReceipt(text) {
  let value;
  let diagnostics;
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 8192) throw 0;
    value = JSON.parse(text);
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !== 'object' ||
      typeof value.qualified !== 'boolean' ||
      ![
        'configuration',
        'build',
        'start',
        'cases',
        'cleanup',
        'complete',
      ].includes(value.phase) ||
      value.productionProof !== false ||
      value.routeAuthorizationProof !== value.qualified ||
      typeof value.serverStopped !== 'boolean' ||
      !Array.isArray(value.cases) ||
      value.cases.length > sessionCases.length ||
      new Set(value.cases).size !== value.cases.length ||
      value.cases.some((entry) => !sessionCases.includes(entry)) ||
      !Number.isInteger(value.assertions) ||
      value.assertions < 0 ||
      value.assertions > 500 ||
      !/^[a-f0-9]{40}$/.test(value.sourceSha)
    )
      throw 0;
    diagnostics = diagnosticFields(value);
  } catch {
    throw new Error('Web session receipt invalid');
  }
  return {
    ...diagnostics,
    qualified: value.qualified,
    phase: value.phase,
    sourceSha: value.sourceSha,
    cases: value.cases,
    assertions: value.assertions,
    serverStopped: value.serverStopped,
    productionProof: false,
    routeAuthorizationProof: value.routeAuthorizationProof,
  };
}

export function assertQualifiedWebSession(
  value,
  status,
  sourceSha,
  processGroupStopped
) {
  if (
    status !== 0 ||
    value.qualified !== true ||
    value.phase !== 'complete' ||
    value.sourceSha !== sourceSha ||
    value.serverStopped !== true ||
    value.routeAuthorizationProof !== true ||
    value.productionProof !== false ||
    processGroupStopped !== true ||
    value.cases.length !== sessionCases.length ||
    sessionCases.some((entry, index) => value.cases[index] !== entry) ||
    value.assertions < sessionCases.length
  )
    throw new Error('Web request/session qualification incomplete');
}
