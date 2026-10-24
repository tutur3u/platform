'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { SETTINGS_DIALOG_OPEN_INTENT_EVENT } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import { useParams, usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsDialogFullscreenSkeleton } from '@/components/settings/settings-dialog-skeleton';
import { useSettingsDialogShortcut } from '@/components/settings/use-settings-dialog-shortcut';
import { useLazyClientComponent } from '@/hooks/use-lazy-client-component';

interface SettingsDialogHostProps {
  wsId?: string;
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
}

type SettingsDialogComponent = ComponentType<{
  boardId?: string;
  defaultTab?: string;
  linkedProvider?: string;
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
  wsId?: string;
}>;

function getRouteParam(params: Record<string, string | string[]>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

type SettingsOpenIntent = {
  settingsBoardId?: string;
  settingsLinkedProvider?: string;
  settingsTab?: string;
};

const SETTINGS_EXTRA_KEYS = [
  'settingsBoardId',
  'settingsLinkedProvider',
] as const;

let settingsDialogPromise: Promise<SettingsDialogComponent> | null = null;

export function preloadSettingsDialog(): Promise<SettingsDialogComponent> {
  settingsDialogPromise ??= import(
    '@/components/settings/settings-dialog'
  ).then((module) => module.SettingsDialog);
  return settingsDialogPromise;
}

function loadSettingsDialog(): Promise<SettingsDialogComponent> {
  return preloadSettingsDialog();
}

export function SettingsDialogHost({
  wsId,
  user,
  workspace,
}: SettingsDialogHostProps) {
  const params = useParams<Record<string, string | string[]>>();
  const pathname = usePathname();
  const {
    closeSettings,
    extras,
    open: requestedSettingsOpen,
    openSettings,
    tab,
  } = useSettingsDialogUrlState(SETTINGS_EXTRA_KEYS);

  const [openIntent, setOpenIntent] = useState<SettingsOpenIntent | null>(null);
  const requestedSettingsTab = tab ?? undefined;
  const requestedSettingsBoardId = extras.settingsBoardId ?? undefined;
  const linkedProvider = extras.settingsLinkedProvider ?? undefined;
  const settingsOpen = requestedSettingsOpen || Boolean(openIntent);
  const SettingsDialog = useLazyClientComponent(
    loadSettingsDialog,
    settingsOpen
  );

  useEffect(() => {
    const handleSettingsIntent = (event: Event) => {
      const detail =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === 'object'
          ? (event.detail as SettingsOpenIntent)
          : {};

      const intent: SettingsOpenIntent = {
        settingsBoardId:
          typeof detail.settingsBoardId === 'string'
            ? detail.settingsBoardId
            : undefined,
        settingsLinkedProvider:
          typeof detail.settingsLinkedProvider === 'string'
            ? detail.settingsLinkedProvider
            : undefined,
        settingsTab:
          typeof detail.settingsTab === 'string'
            ? detail.settingsTab
            : undefined,
      };

      // Local intent state shows the dialog before the URL round-trip; the URL
      // write keeps the opened tab shareable and lets Back close the dialog.
      setOpenIntent(intent);
      openSettings(intent.settingsTab, {
        settingsBoardId: intent.settingsBoardId ?? null,
        settingsLinkedProvider: intent.settingsLinkedProvider ?? null,
      });
      preloadSettingsDialog();
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

  // The optimistic intent only bridges the gap until the URL acknowledges the
  // open. Clear it whenever both exist, independent of the lazy import, so a
  // later Back (URL closed) cannot leave the dialog open via a stale intent,
  // including one re-created by a repeated open while already acknowledged.
  useEffect(() => {
    if (requestedSettingsOpen && openIntent) {
      setOpenIntent(null);
    }
  }, [openIntent, requestedSettingsOpen]);

  const openSettingsDialog = useCallback(() => {
    const routeBoardId = getRouteParam(params, 'boardId');
    const shouldOpenBoardSettings = Boolean(
      routeBoardId && pathname?.includes('/tasks/boards/')
    );

    if (shouldOpenBoardSettings) {
      // The intent listener above writes the board settings URL.
      window.dispatchEvent(
        new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
          detail: {
            settingsBoardId: routeBoardId,
            settingsTab: 'task_board',
          },
        })
      );
      return;
    }

    openSettings(null);
  }, [openSettings, params, pathname]);

  useSettingsDialogShortcut({
    enabled: Boolean(user),
    onOpen: openSettingsDialog,
  });

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpenIntent(null);
      closeSettings();
    }
  };

  if (!user) return null;

  const dialogBoardId = requestedSettingsOpen
    ? requestedSettingsBoardId
    : openIntent?.settingsBoardId;
  const dialogDefaultTab = requestedSettingsOpen
    ? requestedSettingsTab
    : openIntent?.settingsTab;
  const dialogLinkedProvider = requestedSettingsOpen
    ? linkedProvider
    : openIntent?.settingsLinkedProvider;

  return (
    <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
      {settingsOpen &&
        (SettingsDialog ? (
          <SettingsDialog
            wsId={wsId}
            user={user}
            workspace={workspace}
            defaultTab={dialogDefaultTab}
            boardId={dialogBoardId}
            linkedProvider={dialogLinkedProvider}
          />
        ) : (
          <SettingsDialogFullscreenSkeleton />
        ))}
    </Dialog>
  );
}
