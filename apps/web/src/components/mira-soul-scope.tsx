'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
} from 'react';

export const miraSoulKeys = {
  detail: (actorId: string | null) => ['mira-soul', 'detail', actorId] as const,
};

export class MiraSoulLease {
  active = false;
  epoch = 0;
  intent = 0;
  controller = new AbortController();
  constructor(
    readonly actorId: string | null,
    readonly sessionRevision?: string
  ) {}
  activate() {
    this.epoch++;
    this.controller = new AbortController();
    this.active = this.actorId !== null;
  }
  revoke() {
    this.active = false;
    this.epoch++;
    this.controller.abort();
  }
  check(epoch: number) {
    if (!this.active || this.epoch !== epoch || !this.actorId)
      throw new Error('Assistant settings scope changed');
  }
}
const MiraSoulScope = createContext<MiraSoulLease | null>(null);

// The actor comes only from the verified server session. Auth events may revoke
// admission; a different account requires fresh server hydration to admit it.
export function MiraSoulScopeProvider({
  actorId,
  sessionRevision,
  children,
}: {
  actorId: string | null;
  sessionRevision?: string;
  children: ReactNode;
}) {
  const client = useQueryClient();
  const lease = useMemo(
    () => new MiraSoulLease(actorId, sessionRevision),
    [actorId, sessionRevision]
  );
  useLayoutEffect(() => {
    lease.activate();
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== actorId) {
        lease.revoke();
        void client.cancelQueries({
          queryKey: miraSoulKeys.detail(actorId),
          exact: true,
        });
        client.removeQueries({
          queryKey: miraSoulKeys.detail(actorId),
          exact: true,
        });
      }
    });
    return () => {
      lease.revoke();
      subscription.unsubscribe();
      void client.cancelQueries({
        queryKey: miraSoulKeys.detail(actorId),
        exact: true,
      });
      client.removeQueries({
        queryKey: miraSoulKeys.detail(actorId),
        exact: true,
      });
    };
  }, [actorId, client, lease]);
  return (
    <MiraSoulScope.Provider value={lease}>{children}</MiraSoulScope.Provider>
  );
}
export function useMiraSoulScope() {
  return useContext(MiraSoulScope);
}
