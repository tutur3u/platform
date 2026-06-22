'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import dynamic from 'next/dynamic';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback } from 'react';
import { SettingsDialogFullscreenSkeleton } from '@/components/settings/settings-dialog-skeleton';
import { useSettingsDialogShortcut } from '@/components/settings/use-settings-dialog-shortcut';

const SettingsDialog = dynamic(
  () =>
    import('@/components/settings/settings-dialog').then(
      (module) => module.SettingsDialog
    ),
  {
    loading: () => <SettingsDialogFullscreenSkeleton />,
    ssr: false,
  }
);

interface SettingsDialogHostProps {
  wsId?: string;
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
}

export function SettingsDialogHost({
  wsId,
  user,
  workspace,
}: SettingsDialogHostProps) {
  const [settingsQuery, setSettingsQuery] = useQueryStates(
    {
      settingsDialog: parseAsStringLiteral(['open']),
      settingsTab: parseAsString,
      settingsBoardId: parseAsString,
      settingsLinkedProvider: parseAsString,
    },
    {
      history: 'replace',
      shallow: true,
      scroll: false,
    }
  );

  const requestedSettingsOpen = settingsQuery.settingsDialog === 'open';
  const requestedSettingsTab = settingsQuery.settingsTab ?? undefined;
  const requestedSettingsBoardId = settingsQuery.settingsBoardId ?? undefined;
  const linkedProvider = settingsQuery.settingsLinkedProvider ?? undefined;

  const openSettingsDialog = useCallback(() => {
    void setSettingsQuery(
      {
        settingsDialog: 'open',
        settingsTab: null,
        settingsBoardId: null,
        settingsLinkedProvider: null,
      },
      {
        history: 'replace',
        shallow: true,
        scroll: false,
      }
    );
  }, [setSettingsQuery]);

  useSettingsDialogShortcut({
    enabled: Boolean(user),
    onOpen: openSettingsDialog,
  });

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      void setSettingsQuery(
        {
          settingsDialog: null,
          settingsTab: null,
          settingsBoardId: null,
          settingsLinkedProvider: null,
        },
        {
          history: 'replace',
          shallow: true,
          scroll: false,
        }
      );
    }
  };

  if (!user) return null;

  return (
    <Dialog
      open={requestedSettingsOpen}
      onOpenChange={handleSettingsOpenChange}
    >
      <SettingsDialog
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultTab={requestedSettingsTab}
        boardId={requestedSettingsBoardId}
        linkedProvider={linkedProvider}
      />
    </Dialog>
  );
}
