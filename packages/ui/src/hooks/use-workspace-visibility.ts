'use client';

import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  getCurrentUserHiddenWorkspaces,
  updateCurrentUserHiddenWorkspace,
} from '@tuturuuu/internal-api/users';
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const controls = new WeakMap<
  QueryClient,
  Map<string, { revision: number; pending: Set<string> }>
>();
function ownerControl(client: QueryClient, actorId: string) {
  let actors = controls.get(client);
  if (!actors) {
    actors = new Map();
    controls.set(client, actors);
  }
  let control = actors.get(actorId);
  if (!control) {
    control = { revision: 0, pending: new Set() };
    actors.set(actorId, control);
  }
  return control;
}

type ActorScope = {
  actorId: string;
  lifetime: { active: boolean };
  assertActive: () => void;
};
const ActorContext = createContext<ActorScope | null>(null);

/** Feed only a server-verified actor; preferences never become membership data. */
export function WorkspaceVisibilityProvider({
  actorId,
  children,
}: {
  actorId: string;
  children: ReactNode;
}) {
  const parent = useContext(ActorContext);
  const current = useRef(actorId);
  current.current = actorId;
  const scope = useMemo(() => {
    if (parent?.actorId === actorId) return parent;
    const lifetime = { active: true };
    return {
      actorId,
      lifetime,
      assertActive() {
        parent?.assertActive();
        if (
          !lifetime.active ||
          current.current !== actorId ||
          (parent && parent.actorId !== actorId)
        ) {
          throw new Error('Workspace account changed');
        }
      },
    };
  }, [actorId, parent]);
  const client = useQueryClient();
  useEffect(() => {
    if (scope === parent) return;
    scope.lifetime.active = true;
    return () => {
      scope.lifetime.active = false;
      controls.get(client)?.delete(scope.actorId);
      // A private cache is never retained across logout/account replacement.
      client.removeQueries({ queryKey: ['workspace-hidden', scope.actorId] });
      client.removeQueries({ queryKey: ['workspace-ui-list', scope.actorId] });
      client.removeQueries({ queryKey: ['user-workspaces', scope.actorId] });
      client.removeQueries({ queryKey: ['all-user-boards', scope.actorId] });
      client.removeQueries({ queryKey: ['chat-workspaces', scope.actorId] });
      client.removeQueries({ queryKey: ['task-source-boards', scope.actorId] });
      client.removeQueries({ queryKey: ['workspace-user', scope.actorId] });
      client.removeQueries({
        queryKey: ['workspace-invitations', scope.actorId],
      });
      client.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === 'global-command-launcher' &&
          query.queryKey.includes(scope.actorId),
      });
      client.removeQueries({
        queryKey: ['workspace-select-current-workspace', scope.actorId],
      });
    };
  }, [scope, parent, client]);
  return createElement(
    ActorContext.Provider,
    {
      key: actorId,
      value: parent && parent.actorId !== actorId ? null : scope,
    },
    children
  );
}

export function useWorkspaceActor() {
  return useContext(ActorContext);
}

export function useWorkspaceVisibility(enabled = true) {
  const scope = useWorkspaceActor();
  const actorId = scope?.actorId;
  const client = useQueryClient();
  const key = ['workspace-hidden', actorId] as const;
  const control = ownerControl(client, actorId ?? 'signed-out');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const query = useQuery({
    queryKey: key,
    enabled: enabled && Boolean(scope),
    queryFn: async () => {
      scope!.assertActive();
      if (control.pending.size > 0) {
        const optimistic = client.getQueryData<string[]>(key);
        if (optimistic) return optimistic;
      }
      const requestRevision = control.revision;
      const response = await getCurrentUserHiddenWorkspaces(actorId!);
      scope!.assertActive();
      // A refresh started before a mutation cannot overwrite its optimistic state.
      if (requestRevision !== control.revision) {
        return (
          client.getQueryData<string[]>(key) ?? response.hiddenWorkspaceIds
        );
      }
      return response.hiddenWorkspaceIds;
    },
    staleTime: 30_000,
    retry: 1,
  });
  const accountDenied =
    query.error instanceof InternalApiError &&
    [401, 403, 409].includes(query.error.status);
  const ids = accountDenied ? undefined : query.data;
  async function setHidden(workspaceId: string, hidden: boolean) {
    if (!scope || !ids || control.pending.has(workspaceId)) return;
    scope.assertActive();
    const ownerKey = ['workspace-hidden', scope.actorId] as const;
    const wasHidden = ids.includes(workspaceId);
    control.pending.add(workspaceId);
    setPending(new Set(control.pending));
    setUpdateError(null);
    control.revision++;
    await client.cancelQueries({ queryKey: ownerKey });
    scope.assertActive();
    client.setQueryData<string[]>(ownerKey, (current = []) =>
      hidden
        ? [...new Set([...current, workspaceId])]
        : current.filter((id) => id !== workspaceId)
    );
    try {
      await updateCurrentUserHiddenWorkspace(
        workspaceId,
        hidden,
        scope.actorId
      );
      scope.assertActive();
    } catch (error) {
      try {
        scope.assertActive();
      } catch {
        return;
      }
      client.setQueryData<string[]>(ownerKey, (current = []) =>
        wasHidden
          ? [...new Set([...current, workspaceId])]
          : current.filter((id) => id !== workspaceId)
      );
      setUpdateError(
        error instanceof Error
          ? error
          : new Error('Unable to update Hidden workspaces')
      );
      throw error;
    } finally {
      control.pending.delete(workspaceId);
      try {
        scope.assertActive();
        setPending(new Set(control.pending));
        if (control.pending.size === 0) {
          void client.invalidateQueries({ queryKey: ownerKey });
        }
      } catch {
        /* An old account cannot publish into the next account. */
      }
    }
  }
  return {
    ...query,
    refetch: async () => {
      if (!scope) return null;
      try {
        scope.assertActive();
      } catch {
        return null;
      }
      const result = await query.refetch();
      try {
        scope.assertActive();
      } catch {
        return null;
      }
      if (!result.error) setUpdateError(null);
      return result;
    },
    accountDenied,
    actorId,
    hiddenIds: ids ?? [],
    known: ids !== undefined,
    pending,
    updateError,
    setHidden,
  };
}
