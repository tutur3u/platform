import { useLayoutEffect, useState } from 'react';
import { MAX_DESCRIPTION_SETTLE_MS } from '../constants';

export function useTaskDialogSettling({
  isOpen,
  taskId,
  isHydratingTask,
  isYjsSyncing,
}: {
  isOpen: boolean;
  taskId?: string;
  isHydratingTask: boolean;
  isYjsSyncing: boolean;
}): boolean {
  const [wait, setWait] = useState<{ taskId?: string; expired: boolean }>({
    expired: false,
  });

  // Reset before paint on reopen/task switch. A slow row load must not consume
  // the separate bounded wait for the final editor's durable document.
  useLayoutEffect(() => {
    setWait({ taskId, expired: false });
    if (!isOpen || isHydratingTask) return;
    const timer = setTimeout(
      () => setWait({ taskId, expired: true }),
      MAX_DESCRIPTION_SETTLE_MS
    );
    return () => clearTimeout(timer);
  }, [isOpen, taskId, isHydratingTask]);

  return (
    isOpen &&
    (isHydratingTask ||
      (isYjsSyncing && !(wait.taskId === taskId && wait.expired)))
  );
}
