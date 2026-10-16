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

export function webSessionReceipt(text) {
  let value;
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
  } catch {
    throw new Error('Web session receipt invalid');
  }
  return {
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
