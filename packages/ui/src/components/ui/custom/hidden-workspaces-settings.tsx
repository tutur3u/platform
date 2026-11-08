'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { useTranslations } from 'next-intl';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from '../../../hooks/use-workspace-visibility';
import { Button } from '../button';
import { Dialog, DialogTrigger } from '../dialog';
import { SettingItemTab } from './settings-item-tab';
import { WorkspacePickerContent } from './workspace-picker-content';

/** Private Settings restore editor; restoring never changes current/default scope. */
export function HiddenWorkspacesSettings() {
  const t = useTranslations('common');
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  const list = useQuery({
    queryKey: ['workspace-ui-list', actor?.actorId],
    enabled: Boolean(actor),
    queryFn: async () => {
      actor!.assertActive();
      const result = await listWorkspaces();
      actor!.assertActive();
      return result;
    },
  });
  return (
    <SettingItemTab
      description={t('hidden_workspaces_description')}
      title={t('hidden_workspaces')}
    >
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={!actor}>
            {t('hidden_workspaces')}
          </Button>
        </DialogTrigger>
        <WorkspacePickerContent
          listLoading={list.isLoading}
          listError={list.error}
          onRetryList={() => {
            void list.refetch();
          }}
          restoreOnly
          workspaces={list.data ?? []}
          visibility={visibility}
          onSelect={() => {}}
        />
      </Dialog>
    </SettingItemTab>
  );
}
