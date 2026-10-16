const phases = new Set([
  'configuration',
  'disposable-administrator',
  'effective-rpc-permissions',
  'journal-create',
  'independent-state',
  'replay-and-conflict',
  'lost-claim-acknowledgement',
  'lost-provider-acknowledgement',
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
export function httpQualificationReceipt(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4096)
    throw new Error('HTTP qualification receipt exceeds bound');
  const candidate = JSON.parse(text);
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    !phases.has(candidate.phase) ||
    typeof candidate.qualified !== 'boolean' ||
    !Number.isInteger(candidate.assertions) ||
    candidate.assertions < 0 ||
    candidate.assertions > 29 ||
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
  };
}
export function assertQualifiedHttp(value) {
  if (
    value.qualified !== true ||
    value.phase !== 'complete' ||
    value.assertions !== 29
  )
    throw new Error('HTTP qualification incomplete');
}
