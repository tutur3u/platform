'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2 } from '@tuturuuu/icons';
import { updateWorkspace } from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { workspaceHandleSchema } from '@tuturuuu/utils/workspace-handle';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface WorkspaceIdentityFormProps {
  canEdit: boolean;
  workspace: Workspace;
}

export function WorkspaceIdentityForm({
  canEdit,
  workspace,
}: WorkspaceIdentityFormProps) {
  const t = useTranslations('ws-settings');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name ?? '');
  const [handle, setHandle] = useState(workspace.handle ?? '');
  const [savedName, setSavedName] = useState(workspace.name ?? '');
  const [savedHandle, setSavedHandle] = useState(workspace.handle ?? '');
  const [copied, setCopied] = useState(false);

  const workspaceQueryFilter = {
    predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
      queryKey[0] === 'workspaces' ||
      queryKey[0] === 'user-workspaces' ||
      queryKey.includes(workspace.id),
  };

  const mutation = useMutation({
    mutationFn: (values: { handle?: string; name: string }) => {
      return updateWorkspace(workspace.id, values);
    },
    onMutate: async (values) => {
      await queryClient.cancelQueries(workspaceQueryFilter);
      const previousQueries = queryClient.getQueriesData(workspaceQueryFilter);
      const optimisticPatch = {
        ...(values.handle ? { handle: values.handle } : {}),
        name: values.name,
      };

      queryClient.setQueriesData(workspaceQueryFilter, (previous) =>
        patchWorkspaceCacheValue(previous, workspace.id, optimisticPatch)
      );

      return { previousQueries };
    },
    onError: (error, _values, context) => {
      for (const [queryKey, previous] of context?.previousQueries ?? []) {
        queryClient.setQueryData(queryKey, previous);
      }
      toast.error(t('name_update_error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: async (_response, values) => {
      const nextHandle = values.handle ?? savedHandle;

      setName(values.name);
      setSavedName(values.name);
      setHandle(nextHandle);
      setSavedHandle(nextHandle);
      queryClient.setQueriesData(workspaceQueryFilter, (previous) =>
        patchWorkspaceCacheValue(previous, workspace.id, {
          handle: nextHandle,
          name: values.name,
        })
      );

      await queryClient.invalidateQueries(workspaceQueryFilter);
      router.refresh();
      toast.success(t('name_updated'));
    },
  });

  useEffect(() => {
    const nextName = workspace.name ?? '';
    const nextHandle = workspace.handle ?? '';
    setName(nextName);
    setSavedName(nextName);
    setHandle(nextHandle);
    setSavedHandle(nextHandle);
  }, [workspace.handle, workspace.name]);

  const normalizedHandle = handle.trim().toLowerCase();
  const handleValid = workspace.personal
    ? true
    : !normalizedHandle ||
      workspaceHandleSchema.safeParse(normalizedHandle).success;
  const dirty =
    name.trim() !== savedName ||
    (!workspace.personal &&
      Boolean(normalizedHandle) &&
      normalizedHandle !== savedHandle);

  return (
    <div className="grid gap-5 rounded-2xl border bg-card/40 p-4 sm:p-5">
      {!workspace.personal && (
        <div className="grid gap-2 sm:grid-cols-2">
          <WorkspaceField label={t('name')}>
            <Input
              disabled={!canEdit || mutation.isPending}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('name_placeholder')}
              value={name}
            />
          </WorkspaceField>
          <WorkspaceField label={t('handle')}>
            <Input
              aria-invalid={!handleValid}
              disabled={!canEdit || mutation.isPending}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              placeholder={t('handle_placeholder')}
              value={handle}
            />
          </WorkspaceField>
        </div>
      )}

      <WorkspaceField label={t('id')}>
        <div className="flex min-w-0 gap-2">
          <Input className="font-mono text-xs" disabled value={workspace.id} />
          <Button
            aria-label={t('copy_id')}
            onClick={async () => {
              await navigator.clipboard.writeText(workspace.id);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </WorkspaceField>

      {!workspace.personal && canEdit && (
        <div className="flex justify-end">
          <Button
            disabled={
              !dirty || !name.trim() || !handleValid || mutation.isPending
            }
            onClick={() =>
              mutation.mutate({
                ...(workspace.personal || !normalizedHandle
                  ? {}
                  : { handle: normalizedHandle }),
                name: name.trim(),
              })
            }
            type="button"
          >
            {mutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Check />
            )}
            {t('save_changes')}
          </Button>
        </div>
      )}
    </div>
  );
}

function patchWorkspaceCacheValue(
  value: unknown,
  workspaceId: string,
  patch: Pick<Workspace, 'name'> & Partial<Pick<Workspace, 'handle'>>
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      patchWorkspaceCacheValue(entry, workspaceId, patch)
    );
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

function WorkspaceField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
