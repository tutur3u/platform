import type { JSONContent } from '@tiptap/react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** A late save receipt belongs to the opening that admitted it. */
export function useTaskDescriptionReceipt({
  isOpen,
  taskId,
  wsId,
}: {
  isOpen: boolean;
  taskId?: string;
  wsId: string;
}) {
  const session = useMemo(
    () => ({ isOpen, taskId, wsId }),
    [isOpen, taskId, wsId]
  );
  const activeSession = useRef(session);
  useLayoutEffect(() => {
    activeSession.current = session;
  }, [session]);
  const [receipt, setReceipt] = useState<{
    session: typeof session;
    content: JSONContent | null;
  }>();
  const confirmSavedDescription = useCallback(
    (content: JSONContent | null) => {
      if (activeSession.current !== session) return;
      setReceipt((previous) =>
        activeSession.current === session ? { session, content } : previous
      );
    },
    [session]
  );
  return {
    confirmedSavedContent:
      isOpen && receipt?.session === session ? receipt.content : undefined,
    confirmSavedDescription,
  };
}
