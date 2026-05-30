'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback } from 'react';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { useSettingsDialogShortcut } from '@/components/settings/use-settings-dialog-shortcut';

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
  const linkedProvider = settingsQuery.settingsLinkedProvider ?? undefined;

  const openSettingsDialog = useCallback(() => {
    void setSettingsQuery(
      {
        settingsDialog: 'open',
        settingsTab: null,
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
        linkedProvider={linkedProvider}
      />
    </Dialog>
  );
}
