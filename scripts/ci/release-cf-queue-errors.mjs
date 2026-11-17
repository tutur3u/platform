export class RecipeFailure extends Error {
  constructor(
    guardCode,
    guardPhase,
    failureClass,
    { terminal = true, providerContacted } = {}
  ) {
    super(guardCode);
    Object.assign(this, {
      guardCode,
      guardPhase,
      failureClass,
      terminal,
      providerContacted,
    });
  }
}
export function failureCause(error, phase, contacted) {
  const failureClass = error?.failureClass ?? error?.class;
  if (
    /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.guardCode ?? '') &&
    /^[a-z][a-z0-9_-]{0,63}$/.test(error?.guardPhase ?? '') &&
    [
      'policy',
      'approval',
      'lock',
      'worker',
      'fence',
      'timeout',
      'authority',
      'executor',
      'verification',
      'validation',
    ].includes(failureClass) &&
    typeof error.terminal === 'boolean' &&
    (error.providerContacted === undefined ||
      typeof error.providerContacted === 'boolean')
  )
    return {
      guardCode: error.guardCode,
      guardPhase: error.guardPhase,
      failureClass,
      terminal: error.terminal,
      providerContacted:
        contacted &&
        !['policy', 'validation', 'approval', 'lock', 'worker'].includes(
          failureClass
        )
          ? true
          : (error.providerContacted ?? contacted),
    };
  return {
    guardCode: contacted ? 'EXECUTOR_UNCERTAIN' : 'AUTHORITY_UNAVAILABLE',
    guardPhase: phase,
    failureClass: contacted ? 'executor' : 'authority',
    terminal: false,
    providerContacted: contacted,
  };
}
