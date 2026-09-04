import { useCallback, useRef } from 'react';

export const TASK_CARD_CONTEXT_MENU_GUARD_MS = 400;

export function isTaskCardContextMenuSelectionGuarded(
  guardUntil: number,
  now = Date.now()
) {
  return guardUntil > now;
}

export function useTaskCardMenuGuard() {
  const guardUntilRef = useRef(0);

  const armContextMenuGuard = useCallback(() => {
    const guardUntil = Date.now() + TASK_CARD_CONTEXT_MENU_GUARD_MS;
    guardUntilRef.current = guardUntil;
    return guardUntil;
  }, []);

  const handleMenuItemSelect = useCallback(
    (event: Event, action: () => void) => {
      if (isTaskCardContextMenuSelectionGuarded(guardUntilRef.current)) {
        event.preventDefault();
        return;
      }

      action();
    },
    []
  );

  return { armContextMenuGuard, handleMenuItemSelect };
}
