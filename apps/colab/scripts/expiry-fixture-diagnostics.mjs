const workerPhases = Object.freeze([
  'fixture-entry',
  'before-failure-alarm',
  'caught',
  'rollback-verified',
  'trigger-removed',
  '100-wakes-complete',
  'rpc-return',
]);
const nodePhases = Object.freeze([
  'fetch-start',
  'fetch-complete',
  'read-start',
  'read-complete',
  'close-start',
  'close-complete',
]);
const maxRecords = 256;

export function projectExpiryDiagnostics(logs, caseName, nodePhase) {
  if (
    !['duplicates', 'failure'].includes(caseName) ||
    !nodePhases.includes(nodePhase)
  ) {
    return { observation: 'invalid' };
  }
  const bounded = Array.isArray(logs) && logs.length <= maxRecords;
  const phases = bounded
    ? workerPhases.flatMap((phase) => {
        const marker = `colab-expiry-fixture:v1:${caseName}:${phase}`;
        const count = logs.filter(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            Number.isFinite(entry.timestamp) &&
            typeof entry.level === 'string' &&
            entry.level.length <= 16 &&
            typeof entry.message === 'string' &&
            entry.message.length <= 96 &&
            entry.message === marker
        ).length;
        return count ? [{ phase, count }] : [];
      })
    : [];
  return {
    observation: bounded ? 'captured' : 'unavailable',
    case: caseName,
    nodePhase,
    phases,
    ...(phases.some(({ phase }) => phase === '100-wakes-complete')
      ? { wakes: 100 }
      : {}),
  };
}
