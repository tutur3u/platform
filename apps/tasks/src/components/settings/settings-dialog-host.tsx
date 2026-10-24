'use client';

import { claimSettingsDialogIntent } from '@tuturuuu/satellite/settings-dialog-intent';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { SETTINGS_DIALOG_OPEN_INTENT_EVENT } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
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

const SETTINGS_EXTRA_KEYS = ['settingsBoardId'] as const;

export function SettingsDialogHost({
  wsId,
  user,
  workspace,
}: SettingsDialogHostProps) {
  const {
    closeSettings,
    extras,
    open: settingsOpen,
    openSettings,
    tab,
  } = useSettingsDialogUrlState(SETTINGS_EXTRA_KEYS);

  const openDefaultSettings = useCallback(() => {
    openSettings(null);
  }, [openSettings]);
  useSettingsDialogShortcut({
    enabled: Boolean(user),
    onOpen: openDefaultSettings,
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

      openSettings(
        typeof detail.settingsTab === 'string' ? detail.settingsTab : null,
        {
          settingsBoardId:
            typeof detail.settingsBoardId === 'string'
              ? detail.settingsBoardId
              : null,
        }
      );
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
  }, [openSettings]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    closeSettings();
  };

  const handleBoardSettingsOpen = (boardId: string) => {
    openSettings('task_board', { settingsBoardId: boardId });
  };

  if (!user) return null;

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      {settingsOpen && (
        <SettingsDialog
          boardId={extras.settingsBoardId ?? undefined}
          defaultTab={tab ?? undefined}
          onBoardSettingsOpen={handleBoardSettingsOpen}
          user={user}
          workspace={workspace}
          wsId={wsId}
        />
      )}
    </Dialog>
  );
}
