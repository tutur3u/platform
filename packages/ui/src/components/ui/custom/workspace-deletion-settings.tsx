'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  deleteWorkspace,
  getWorkspaceDeletionStatus,
} from '@tuturuuu/internal-api/workspaces';
import type { Workspace } from '@tuturuuu/types';
import {
  isWorkspaceDeletionConfirmed,
  isWorkspaceDeletionOwner,
} from '@tuturuuu/utils/workspace-deletion';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../alert-dialog';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';
import { toast } from '../sonner';
import { SettingItemTab } from './settings-item-tab';
import { SettingsSection, SettingsSectionMessage } from './settings-section';

type DeletionWorkspace = Pick<
  Workspace,
  'id' | 'creator_id' | 'name' | 'personal'
>;

export function WorkspaceDeletionSettings({
  workspace,
  actorId,
}: {
  workspace: DeletionWorkspace;
  actorId: string | null | undefined;
}) {
  if (!isWorkspaceDeletionOwner(workspace, actorId)) return null;
  return <DangerZone key={workspace.id} workspace={workspace} />;
}

// Literal keys keep every rendered message visible to the i18n coverage scan.
function getDeletionStatusMessage(
  status: unknown,
  t: ReturnType<typeof useTranslations<'ws-settings'>>
) {
  switch (status) {
    case 'ready':
      return null;
    case 'name_required':
      return t('delete_workspace_name_required');
    case 'checking':
      return t('delete_checking_status');
    case 'subscription_active':
      return t('delete_subscription_active');
    case 'protected':
      return t('delete_workspace_protected');
    default:
      return t('delete_status_failed');
  }
}

function DangerZone({ workspace }: { workspace: DeletionWorkspace }) {
  const t = useTranslations('ws-settings');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const inputId = useId();

  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const eligibility = useQuery({
    queryKey: ['workspace-deletion-status', workspace.id, workspace.creator_id],
    queryFn: () => getWorkspaceDeletionStatus(workspace.id),
    staleTime: 0,
    retry: false,
  });
  const deletion = useMutation({
    mutationFn: (value: string) => deleteWorkspace(workspace.id, value),
    retry: false,
    onSuccess: () => {
      setOpen(false);
      router.push('/');
      router.refresh();
    },
    onError: (error) => {
      const code =
        error instanceof InternalApiError && 'code' in error
          ? error.code
          : undefined;
      if (code === 'subscription_active' || code === 'forbidden') {
        void eligibility.refetch();
      }
      toast.error(t('delete_failed'), {
        description:
          code === 'subscription_active'
            ? t('delete_subscription_active')
            : code === 'confirmation_mismatch'
              ? t('delete_confirmation_mismatch')
              : t('delete_failed_description'),
      });
    },
  });

  const status = !workspace.name?.trim()
    ? 'name_required'
    : eligibility.isError
      ? 'failed'
      : (eligibility.data?.status ?? 'checking');
  const ready = status === 'ready' && !deletion.isSuccess;
  const blockedMessage = getDeletionStatusMessage(status, t);
  const canSubmit =
    ready &&
    !deletion.isPending &&
    isWorkspaceDeletionConfirmed(confirmation, workspace);

  return (
    <SettingsSection title={t('danger_zone')}>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (deletion.isPending) return;
          if (next) setConfirmation('');
          setOpen(next);
        }}
      >
        <SettingItemTab
          title={t('delete')}
          description={t('delete_workspace_warning')}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={!ready}>
              {t('delete')}
            </Button>
          </AlertDialogTrigger>
        </SettingItemTab>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich('delete_confirmation_description', {
                name: workspace.name ?? '',
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) deletion.mutate(confirmation);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={inputId}>
                {t.rich('delete_confirmation_prompt', {
                  name: workspace.name ?? '',
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </Label>
              <Input
                id={inputId}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={deletion.isPending}
                autoComplete="off"
              />
            </div>
            {blockedMessage && (
              <p className="text-muted-foreground text-sm" role="status">
                {blockedMessage}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletion.isPending}>
                {tCommon('cancel')}
              </AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!canSubmit}>
                {deletion.isPending ? t('deleting') : t('delete')}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {blockedMessage && (
        <SettingsSectionMessage
          tone={eligibility.isError ? 'error' : 'muted'}
          action={
            eligibility.isError ? (
              <Button
                variant="outline"
                onClick={() => void eligibility.refetch()}
              >
                {tCommon('retry')}
              </Button>
            ) : undefined
          }
        >
          <span role={eligibility.isError ? undefined : 'status'}>
            {blockedMessage}
          </span>
        </SettingsSectionMessage>
      )}
    </SettingsSection>
  );
}
