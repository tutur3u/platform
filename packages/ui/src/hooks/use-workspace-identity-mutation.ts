'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspace } from '@tuturuuu/internal-api/workspaces';
import { useRouter } from 'next/navigation';

export interface WorkspaceIdentityPatch {
  handle?: string;
  name?: string;
}

interface QueryKeyFilter {
  queryKey: readonly unknown[];
}

/**
 * Matches every cached query that can carry this workspace's name or handle.
 *
 * The workspace selector reads `['workspaces']`, satellite panels read
 * `['workspace', wsId]`, and the selector's fallback reads
 * `['workspace-select-current-workspace', wsId]` — so match by the well-known
 * roots plus any key mentioning the workspace id.
 */
export function createWorkspaceQueryFilter(workspaceId: string) {
  return {
    predicate: ({ queryKey }: QueryKeyFilter) =>
      queryKey[0] === 'workspaces' ||
      queryKey[0] === 'user-workspaces' ||
      queryKey.includes(workspaceId),
  };
}

/**
 * Apply a patch to any shape a workspace can take inside a cached value: the
 * record itself, an array of records, or a wrapper such as `{ data }`,
 * `{ workspace }` or `{ workspaces }`.
 */
export function patchWorkspaceCacheValue(
  value: unknown,
  workspaceId: string,
  patch: WorkspaceIdentityPatch
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const nextArray = value.map((entry) => {
      const nextEntry = patchWorkspaceCacheValue(entry, workspaceId, patch);
      if (nextEntry !== entry) changed = true;
      return nextEntry;
    });

    return changed ? nextArray : value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (record.id === workspaceId) {
    return { ...record, ...patch };
  }

  let changed = false;
  const nextRecord = { ...record };
  for (const key of ['data', 'workspace', 'workspaces'] as const) {
    if (!(key in record)) continue;
    const nextValue = patchWorkspaceCacheValue(record[key], workspaceId, patch);
    if (nextValue !== record[key]) {
      nextRecord[key] = nextValue;
      changed = true;
    }
  }

  return changed ? nextRecord : value;
}

/**
 * Rename a workspace and make every surface agree, without a page reload.
 *
 * A workspace name is read from two independent places: client caches (the
 * workspace selector, settings panels) and server-rendered markup (sidebars,
 * headers). `router.refresh()` only refreshes the second, so a form that just
 * calls it leaves the selector showing the old name until the user reloads —
 * which is exactly what shipped in `apps/web`. This does all three steps:
 * patch the caches optimistically, revalidate them, and refresh the server tree.
 *
 * Every app's settings dialog should mutate the workspace through this hook, so
 * the propagation rules live in one place rather than being re-derived per app.
 */
export function useUpdateWorkspaceIdentity({
  onError,
  onSuccess,
  workspaceId,
}: {
  onError?: (error: unknown) => void;
  onSuccess?: (patch: WorkspaceIdentityPatch) => void;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const workspaceQueryFilter = createWorkspaceQueryFilter(workspaceId);

  return useMutation({
    mutationFn: (values: WorkspaceIdentityPatch) =>
      updateWorkspace(workspaceId, values as { handle?: string; name: string }),
    onError: (error, _values, context) => {
      for (const [queryKey, previous] of context?.previousQueries ?? []) {
        queryClient.setQueryData(queryKey, previous);
      }

      onError?.(error);
    },
    onMutate: async (values: WorkspaceIdentityPatch) => {
      await queryClient.cancelQueries(workspaceQueryFilter);
      const previousQueries = queryClient.getQueriesData(workspaceQueryFilter);

      queryClient.setQueriesData(workspaceQueryFilter, (previous) =>
        patchWorkspaceCacheValue(previous, workspaceId, values)
      );

      return { previousQueries };
    },
    onSuccess: async (_response, values: WorkspaceIdentityPatch) => {
      queryClient.setQueriesData(workspaceQueryFilter, (previous) =>
        patchWorkspaceCacheValue(previous, workspaceId, values)
      );

      await queryClient.invalidateQueries(workspaceQueryFilter);
      // Server-rendered surfaces (sidebar header, page titles) need this; the
      // cache work above is what keeps the client-side selector honest.
      router.refresh();

      onSuccess?.(values);
    },
  });
}
