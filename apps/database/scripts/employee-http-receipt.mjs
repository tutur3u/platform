const phases = new Set([
  'configuration',
  'disposable-administrator',
  'effective-rpc-permissions',
  'journal-create',
  'independent-state',
  'replay-and-conflict',
  'lost-claim-acknowledgement',
  'lost-provider-acknowledgement',
  'restore-runtime',
  'rejection-adjudication',
  'complete',
]);
export function selectHttpRuntime(value, journal) {
  if (
    ![undefined, 'false', 'true'].includes(value) ||
    (value === 'true' && !journal)
  )
    throw new Error('HTTP qualification requires the journal qualification');
  return value === 'true';
}
export const restorePhaseCounts = Object.freeze({
  'restore-effective-permissions': 18,
  'restore-success-and-replay': 11,
  'restore-lost-reserved-acknowledgement': 8,
  'restore-lost-attempted-acknowledgement': 8,
  'restore-lost-completed-acknowledgement': 8,
  'restore-lost-provider-acknowledgement': 8,
  'restore-revoked-actor': 5,
});
export function selectRestoreRuntime(value, http) {
  if (
    ![undefined, 'false', 'true'].includes(value) ||
    (value === 'true' && !http)
  )
    throw new Error('RESTORE qualification requires HTTP qualification');
  return value === 'true';
}
function restoreReceipt(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.qualified !== 'boolean' ||
    ![...Object.keys(restorePhaseCounts), 'complete'].includes(value.phase) ||
    !Number.isInteger(value.assertions) ||
    value.assertions < 0 ||
    value.assertions > 66 ||
    !value.phaseAssertions ||
    typeof value.phaseAssertions !== 'object' ||
    Array.isArray(value.phaseAssertions)
  )
    throw new Error('RESTORE qualification receipt shape invalid');
  const entries = Object.entries(value.phaseAssertions);
  if (
    entries.some(
      ([phase, count]) =>
        !Object.hasOwn(restorePhaseCounts, phase) ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > restorePhaseCounts[phase]
    ) ||
    entries.reduce((sum, [, count]) => sum + count, 0) !== value.assertions
  )
    throw new Error('RESTORE qualification receipt counts invalid');
  return {
    qualified: value.qualified,
    phase: value.phase,
    assertions: value.assertions,
    phaseAssertions: Object.fromEntries(entries),
  };
}
function rejectionFailure(value) {
  const steps = [
    'claim',
    'attempt',
    'auth-rejection',
    'auth-status',
    'auth-code',
    'auth-absence',
    'unknown',
    'expiry',
    'adjudicate',
    'readback',
    'duplicate-denial',
    'completion',
    'final-readback',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !(
      steps.includes(value.step) ||
      /^adjudicate-http-[1-5][0-9]{2}$/.test(value.step)
    ) ||
    !['assertion', 'schema', 'other'].includes(value.kind) ||
    !/^[a-f0-9]{64}$/.test(value.messageSha256) ||
    Object.keys(value).some(
      (key) =>
        ![
          'step',
          'kind',
          'messageSha256',
          'actual',
          'httpStatus',
          'userReturned',
          'providerCode',
        ].includes(key)
    ) ||
    (Object.hasOwn(value, 'actual') &&
      !(
        Number.isInteger(value.actual) &&
        value.actual >= 0 &&
        value.actual <= 599
      ) &&
      ![
        'weak_password',
        'validation_failed',
        'created',
        'active',
        'reserved',
        'unknown',
        true,
        false,
        null,
        'redacted',
        'undefined',
      ].includes(value.actual))
  )
    throw new Error('Rejection failure diagnostic invalid');
  if (
    (value.httpStatus !== undefined &&
      value.httpStatus !== null &&
      !(
        Number.isInteger(value.httpStatus) &&
        value.httpStatus >= 100 &&
        value.httpStatus <= 599
      )) ||
    (value.userReturned !== undefined &&
      typeof value.userReturned !== 'boolean') ||
    (value.providerCode !== undefined &&
      ![
        'weak_password',
        'validation_failed',
        'email_exists',
        'unexpected_failure',
        'none',
        'redacted',
      ].includes(value.providerCode))
  )
    throw new Error('Rejection provider observation invalid');
  return {
    ...(value.httpStatus === undefined ? {} : { httpStatus: value.httpStatus }),
    ...(value.userReturned === undefined
      ? {}
      : { userReturned: value.userReturned }),
    ...(value.providerCode === undefined
      ? {}
      : { providerCode: value.providerCode }),
    step: value.step,
    kind: value.kind,
    messageSha256: value.messageSha256,
    ...(Object.hasOwn(value, 'actual') ? { actual: value.actual } : {}),
  };
}
function managedProfileReceipt(value) {
  if (
    value?.qualified !== true ||
    value.assertions !== 11 ||
    value.writes !== 1 ||
    value.lostAcknowledgementReadback !== true ||
    value.routeAuthorizationProof !== false ||
    value.productionProof !== false
  )
    throw new Error('Managed profile HTTP receipt invalid');
  return {
    qualified: true,
    assertions: 11,
    writes: 1,
    lostAcknowledgementReadback: true,
    routeAuthorizationProof: false,
    productionProof: false,
  };
}
export function httpQualificationReceipt(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4096)
    throw new Error('HTTP qualification receipt exceeds bound');
  let candidate;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error('HTTP qualification receipt shape invalid');
  }
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    !phases.has(candidate.phase) ||
    typeof candidate.qualified !== 'boolean' ||
    !Number.isInteger(candidate.assertions) ||
    candidate.assertions < 0 ||
    candidate.assertions > 30 ||
    candidate.productionProof !== false ||
    candidate.routeAuthorizationProof !== false
  )
    throw new Error('HTTP qualification receipt shape invalid');
  // Persist only these fixed fields, including for failed child invocations.
  return {
    qualified: candidate.qualified,
    phase: candidate.phase,
    assertions: candidate.assertions,
    productionProof: false,
    routeAuthorizationProof: false,
    ...(candidate.rejectionFailure === undefined
      ? {}
      : { rejectionFailure: rejectionFailure(candidate.rejectionFailure) }),
    ...(candidate.managedProfileQualification === undefined
      ? {}
      : {
          managedProfileQualification: managedProfileReceipt(
            candidate.managedProfileQualification
          ),
        }),
    ...(candidate.restoreQualification === undefined
      ? {}
      : {
          restoreQualification: restoreReceipt(candidate.restoreQualification),
        }),
  };
}
export function assertQualifiedHttp(value, status, restore = false) {
  if (
    status !== 0 ||
    value.qualified !== true ||
    value.phase !== 'complete' ||
    value.assertions !== 30 ||
    (restore &&
      (!value.restoreQualification?.qualified ||
        value.restoreQualification.phase !== 'complete' ||
        value.restoreQualification.assertions !== 66 ||
        Object.entries(restorePhaseCounts).some(
          ([phase, count]) =>
            value.restoreQualification.phaseAssertions[phase] !== count
        )))
  )
    throw new Error('HTTP qualification incomplete');
}
