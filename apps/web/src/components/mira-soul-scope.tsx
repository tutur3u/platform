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

/**
 * Query roots whose data belongs to the session actor. They are cancelled
 * and removed whenever the authenticated actor changes or the scope unmounts.
 */
export const ACTOR_SCOPED_QUERY_ROOTS = ['live-eligibility'] as const;

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
      if (isSessionChange(session, actorId, sessionRevision)) {
        lease.revoke();
        void client.cancelQueries({
          queryKey: miraSoulKeys.detail(actorId),
          exact: true,
        });
        client.removeQueries({
          queryKey: miraSoulKeys.detail(actorId),
          exact: true,
        });
        dropActorScopedQueries(client);
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
      dropActorScopedQueries(client);
    };
  }, [actorId, client, lease, sessionRevision]);
  return (
    <MiraSoulScope.Provider value={lease}>{children}</MiraSoulScope.Provider>
  );
}
/**
 * A different actor, or a new sign-in by the same actor (a new
 * `last_sign_in_at` revision), ends the scope. Token refreshes keep the
 * revision and so keep the scope.
 */
export function isSessionChange(
  session: { user: { id: string; last_sign_in_at?: string | null } } | null,
  actorId: string | null,
  sessionRevision?: string
) {
  if ((session?.user.id ?? null) !== actorId) return true;
  const revision = session?.user.last_sign_in_at;
  return Boolean(sessionRevision && revision && revision !== sessionRevision);
}

function dropActorScopedQueries(client: ReturnType<typeof useQueryClient>) {
  for (const root of ACTOR_SCOPED_QUERY_ROOTS) {
    void client.cancelQueries({ queryKey: [root] });
    client.removeQueries({ queryKey: [root] });
  }
}

export function useMiraSoulScope() {
  return useContext(MiraSoulScope);
}
