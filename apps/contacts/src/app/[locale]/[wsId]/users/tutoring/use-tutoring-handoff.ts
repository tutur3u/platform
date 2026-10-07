'use client';

import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useLayoutEffect, useMemo, useRef } from 'react';

/** A committed scope plus explicit user interaction owns each async handoff. */
export function useTutoringHandoff(wsId: string, canManage: boolean) {
  const actor = useWorkspaceActor();
  const scope = useMemo(
    () => ({ wsId, canManage, actor }),
    [wsId, canManage, actor]
  );
  const state = useRef({ active: false, revision: 0, scope });
  useLayoutEffect(() => {
    state.current.scope = scope;
    state.current.active = Boolean(
      scope.wsId && scope.canManage && scope.actor
    );
    state.current.revision++;
    return () => {
      state.current.active = false;
      state.current.revision++;
    };
  }, [scope]);

  const cancel = () => {
    state.current.revision++;
  };
  const begin = () => {
    cancel();
    const revision = state.current.revision;
    return () => {
      if (
        !canManage ||
        !actor ||
        !state.current.active ||
        state.current.scope !== scope ||
        state.current.revision !== revision
      )
        return false;
      try {
        actor.assertActive();
        return true;
      } catch {
        return false;
      }
    };
  };
  return { begin, cancel, scope };
}

/** Oldest outstanding supplied date is visible and editable, never auto-saved. */
export function oldestMissedDate(dates: string[]) {
  return (
    dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()[0] ?? ''
  );
}
