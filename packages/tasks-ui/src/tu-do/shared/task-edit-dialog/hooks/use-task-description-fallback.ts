import { useEffect, useRef } from 'react';

const INITIAL_COLLABORATION_TIMEOUT_MS = 2500;

export function useTaskDescriptionFallback({
  taskId,
  ready,
  hydrationFailed,
  setFallbackTaskId,
}: {
  taskId?: string;
  ready: boolean;
  hydrationFailed: boolean;
  setFallbackTaskId: (taskId: string) => void;
}) {
  const readyTaskId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!taskId) {
      readyTaskId.current = undefined;
      return;
    }
    if (ready) {
      readyTaskId.current = taskId;
      return;
    }
    if (readyTaskId.current === taskId) return;

    if (hydrationFailed) {
      setFallbackTaskId(taskId);
      return;
    }

    const timeout = setTimeout(
      () => setFallbackTaskId(taskId),
      INITIAL_COLLABORATION_TIMEOUT_MS
    );
    return () => clearTimeout(timeout);
  }, [taskId, ready, hydrationFailed, setFallbackTaskId]);
}
