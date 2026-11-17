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
export function failureCause(error, phase, contacted, forceContacted = false) {
  const fallback = {
    guardCode: contacted ? 'EXECUTOR_UNCERTAIN' : 'AUTHORITY_UNAVAILABLE',
    guardPhase: phase,
    failureClass: contacted ? 'executor' : 'authority',
    terminal: false,
    providerContacted: contacted || forceContacted,
  };
  try {
    const guardCode = error?.guardCode;
    const guardPhase = error?.guardPhase;
    const failureClass = error?.failureClass ?? error?.class;
    const terminal = error?.terminal;
    const providerContacted = error?.providerContacted;
    if (
      typeof guardCode !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(guardCode) ||
      typeof guardPhase !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(guardPhase) ||
      ![
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
      ].includes(failureClass) ||
      typeof terminal !== 'boolean' ||
      (providerContacted !== undefined &&
        typeof providerContacted !== 'boolean')
    )
      return fallback;
    return {
      guardCode,
      guardPhase,
      failureClass,
      terminal,
      providerContacted:
        forceContacted ||
        (contacted &&
          !['policy', 'validation', 'approval', 'lock', 'worker'].includes(
            failureClass
          ))
          ? true
          : (providerContacted ?? contacted),
    };
  } catch {
    return fallback;
  }
}
