type IntentResult<T> = { kind: 'current'; value: T } | { kind: 'stale' };

/** One queue per browser realm; Web Locks extends admission across same-origin tabs. */
export function createSwitchIntentFence(
  admit: <T>(operation: () => Promise<T>) => Promise<T> = (operation) =>
    operation()
) {
  let generation = 0;
  let tail: Promise<unknown> = Promise.resolve();

  return async function run<T>(
    dispatch: () => Promise<T>,
    publish: (value: T, isCurrent: () => boolean) => Promise<void>,
    isLatest: () => boolean = () => true
  ): Promise<IntentResult<T>> {
    const intent = ++generation;
    const isCurrent = () => generation === intent && isLatest();
    const operation = tail.then(() =>
      admit(async (): Promise<IntentResult<T>> => {
        if (!isCurrent()) return { kind: 'stale' };
        const value = await dispatch();
        if (!isCurrent()) return { kind: 'stale' };
        await publish(value, isCurrent);
        return isCurrent() ? { kind: 'current', value } : { kind: 'stale' };
      })
    );
    tail = operation.catch(() => undefined);
    return operation;
  };
}

const INTENT_KEY = 'tuturuuu-account-switch-intent';
const runIntent = createSwitchIntentFence((operation) =>
  typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('tuturuuu-account-switch', operation)
    : operation()
);

export function runSwitchIntent<T>(
  dispatch: () => Promise<T>,
  publish: (value: T, isCurrent: () => boolean) => Promise<void>
) {
  const intent = crypto.randomUUID();
  if (typeof window !== 'undefined')
    window.localStorage.setItem(INTENT_KEY, intent);
  return runIntent(dispatch, publish, () => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(INTENT_KEY) === intent;
    } catch {
      return false;
    }
  });
}
