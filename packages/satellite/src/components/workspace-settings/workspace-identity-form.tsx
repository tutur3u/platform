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
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name ?? '');
  const [handle, setHandle] = useState(workspace.handle ?? '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setName(workspace.name ?? '');
    setHandle(workspace.handle ?? '');
  }, [workspace.handle, workspace.name]);

  const mutation = useMutation({
    mutationFn: () =>
      updateWorkspace(workspace.id, {
        handle: workspace.personal ? undefined : handle.trim().toLowerCase(),
        name: name.trim(),
      }),
    onError: (error) => {
      toast.error(t('name_update_error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspace', workspace.id],
      });
      toast.success(t('name_updated'));
    },
  });

  const normalizedHandle = handle.trim().toLowerCase();
  const handleValid = workspace.personal
    ? true
    : workspaceHandleSchema.safeParse(normalizedHandle).success;
  const dirty =
    name.trim() !== (workspace.name ?? '') ||
    (!workspace.personal && normalizedHandle !== (workspace.handle ?? ''));

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
          <Input className="font-mono text-xs" readOnly value={workspace.id} />
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
            onClick={() => mutation.mutate()}
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
