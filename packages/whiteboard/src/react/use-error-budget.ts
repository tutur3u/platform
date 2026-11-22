import { useCallback, useMemo, useRef, useState } from 'react';

const DEFAULT_MAX_ERRORS = 3;

/**
 * Counts consecutive failures. Once the budget is spent the owner stops
 * sending until a success resets it; `exhausted` latches for the UI.
 */
export function useErrorBudget(
  onError?: (error: Error) => void,
  max = DEFAULT_MAX_ERRORS
) {
  const countRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [exhausted, setExhausted] = useState(false);

  const record = useCallback(
    (error: unknown, notify = false) => {
      countRef.current++;
      if (countRef.current >= max) {
        setExhausted(true);
      }
      if (notify && error instanceof Error) {
        onErrorRef.current?.(error);
      }
    },
    [max]
  );

  const reset = useCallback(() => {
    countRef.current = 0;
  }, []);

  const isSpent = useCallback(() => countRef.current >= max, [max]);

  return useMemo(
    () => ({ exhausted, record, reset, isSpent }),
    [exhausted, record, reset, isSpent]
  );
}

export type ErrorBudget = ReturnType<typeof useErrorBudget>;
