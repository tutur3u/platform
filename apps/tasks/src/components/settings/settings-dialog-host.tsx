'use client';

import { claimSettingsDialogIntent } from '@tuturuuu/satellite/settings-dialog-intent';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback, useEffect } from 'react';
import { SettingsDialog } from './settings-dialog';

interface SettingsDialogHostProps {
  wsId?: string;
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
}

type SettingsOpenIntent = {
  settingsBoardId?: string;
  settingsTab?: string;
};

const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';

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
    },
    {
      history: 'replace',
      shallow: true,
      scroll: false,
    }
  );

  const openSettings = useCallback(() => {
    void setSettingsQuery({
      settingsDialog: 'open',
      settingsTab: null,
      settingsBoardId: null,
    });
  }, [setSettingsQuery]);
  useSettingsDialogShortcut({
    enabled: Boolean(user),
    onOpen: openSettings,
  });

  useEffect(() => {
    const handleSettingsIntent = (event: Event) => {
      if (!claimSettingsDialogIntent(event)) return;

      const detail =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === 'object'
          ? (event.detail as SettingsOpenIntent)
          : {};

      void setSettingsQuery({
        settingsDialog: 'open',
        settingsBoardId:
          typeof detail.settingsBoardId === 'string'
            ? detail.settingsBoardId
            : null,
        settingsTab:
          typeof detail.settingsTab === 'string' ? detail.settingsTab : null,
      });
    };

    window.addEventListener(
      SETTINGS_DIALOG_OPEN_INTENT_EVENT,
      handleSettingsIntent
    );

    return () => {
      window.removeEventListener(
        SETTINGS_DIALOG_OPEN_INTENT_EVENT,
        handleSettingsIntent
      );
    };
  }, [setSettingsQuery]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;

    void setSettingsQuery({
      settingsDialog: null,
      settingsTab: null,
      settingsBoardId: null,
    });
  };

  if (!user) return null;

  const settingsOpen = settingsQuery.settingsDialog === 'open';

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      {settingsOpen && (
        <SettingsDialog
          boardId={settingsQuery.settingsBoardId ?? undefined}
          defaultTab={settingsQuery.settingsTab ?? undefined}
          user={user}
          workspace={workspace}
          wsId={wsId}
        />
      )}
    </Dialog>
  );
}
