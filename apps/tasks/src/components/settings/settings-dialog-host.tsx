'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openIntent, setOpenIntent] = useState<SettingsOpenIntent | null>(null);

  useEffect(() => {
    const handleSettingsIntent = (event: Event) => {
      const detail =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === 'object'
          ? (event.detail as SettingsOpenIntent)
          : {};

      setOpenIntent({
        settingsBoardId:
          typeof detail.settingsBoardId === 'string'
            ? detail.settingsBoardId
            : undefined,
        settingsTab:
          typeof detail.settingsTab === 'string'
            ? detail.settingsTab
            : undefined,
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
  }, []);

  const requestedSettingsOpen = searchParams.get('settingsDialog') === 'open';
  const settingsOpen = requestedSettingsOpen || Boolean(openIntent);

  useEffect(() => {
    if (requestedSettingsOpen) setOpenIntent(null);
  }, [requestedSettingsOpen]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;

    setOpenIntent(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('settingsDialog');
    params.delete('settingsTab');
    params.delete('settingsBoardId');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  if (!user) return null;

  const dialogBoardId = requestedSettingsOpen
    ? (searchParams.get('settingsBoardId') ?? undefined)
    : openIntent?.settingsBoardId;
  const dialogDefaultTab = requestedSettingsOpen
    ? (searchParams.get('settingsTab') ?? undefined)
    : openIntent?.settingsTab;

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      {settingsOpen && (
        <SettingsDialog
          boardId={dialogBoardId}
          defaultTab={dialogDefaultTab}
          user={user}
          workspace={workspace}
          wsId={wsId}
        />
      )}
    </Dialog>
  );
}
