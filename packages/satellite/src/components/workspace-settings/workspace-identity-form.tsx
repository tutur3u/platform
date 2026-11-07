'use client';

import { Check, Copy, Loader2 } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSectionFooter } from '@tuturuuu/ui/custom/settings-section';
import { useUpdateWorkspaceIdentity } from '@tuturuuu/ui/hooks/use-workspace-identity-mutation';
import { Input } from '@tuturuuu/ui/input';
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
  const [name, setName] = useState(workspace.name ?? '');
  const [handle, setHandle] = useState(workspace.handle ?? '');
  const [savedName, setSavedName] = useState(workspace.name ?? '');
  const [savedHandle, setSavedHandle] = useState(workspace.handle ?? '');
  const [copied, setCopied] = useState(false);

  const mutation = useUpdateWorkspaceIdentity({
    onError: (error) => {
      toast.error(t('name_update_error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: (values) => {
      const nextName = values.name ?? savedName;
      const nextHandle = values.handle ?? savedHandle;

      setName(nextName);
      setSavedName(nextName);
      setHandle(nextHandle);
      setSavedHandle(nextHandle);
      toast.success(t('name_updated'));
    },
    workspaceId: workspace.id,
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
    <>
      {!workspace.personal && (
        <>
          <SettingItemTab controlWidth="2xl" title={t('name')}>
            <Input
              disabled={!canEdit || mutation.isPending}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('name_placeholder')}
              value={name}
            />
          </SettingItemTab>
          <SettingItemTab controlWidth="2xl" title={t('handle')}>
            <Input
              aria-invalid={!handleValid}
              disabled={!canEdit || mutation.isPending}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              placeholder={t('handle_placeholder')}
              value={handle}
            />
          </SettingItemTab>
        </>
      )}

      <SettingItemTab controlWidth="2xl" title={t('id')}>
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
      </SettingItemTab>

      {!workspace.personal && canEdit && (
        <SettingsSectionFooter>
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
        </SettingsSectionFooter>
      )}
    </>
  );
}
