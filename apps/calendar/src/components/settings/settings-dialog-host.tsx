'use client';

import { claimSettingsDialogIntent } from '@tuturuuu/satellite/settings-dialog-intent';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { SETTINGS_DIALOG_OPEN_INTENT_EVENT } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import { useCallback, useEffect } from 'react';
import { TTR_URL } from '@/constants/common';
import { SettingsDialog } from './settings-dialog';

/** One workspace-owned host independent of responsive account-menu mounts. */
export function SettingsDialogHost({
  user,
  wsId,
}: {
  user: WorkspaceUser | null;
  wsId: string;
}) {
  const { closeSettings, open, openSettings, tab } =
    useSettingsDialogUrlState();
  const openDefaultSettings = useCallback(() => {
    openSettings(null);
  }, [openSettings]);
  useSettingsDialogShortcut({
    enabled: Boolean(user),
    onOpen: openDefaultSettings,
  });
  useEffect(() => {
    if (!user) return;
    const onIntent = (event: Event) => {
      if (!claimSettingsDialogIntent(event)) return;
      const detail = event instanceof CustomEvent ? event.detail : null;
      openSettings(
        typeof detail?.settingsTab === 'string' ? detail.settingsTab : null
      );
    };
    window.addEventListener(SETTINGS_DIALOG_OPEN_INTENT_EVENT, onIntent);
    return () =>
      window.removeEventListener(SETTINGS_DIALOG_OPEN_INTENT_EVENT, onIntent);
  }, [user, openSettings]);
  if (!user) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSettings();
      }}
    >
      {open && (
        <SettingsDialog
          centralUrl={TTR_URL}
          key={`${user.id}:${wsId}:${tab ?? 'default'}`}
          user={user}
          wsId={wsId}
          defaultTab={tab ?? undefined}
        />
      )}
    </Dialog>
  );
}
