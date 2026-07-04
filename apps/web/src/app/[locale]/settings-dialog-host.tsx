'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useParams, usePathname } from 'next/navigation';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
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

const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';

function getRouteParam(params: Record<string, string | string[]>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

type SettingsOpenIntent = {
  settingsBoardId?: string;
  settingsLinkedProvider?: string;
  settingsTab?: string;
};

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
  const [openIntent, setOpenIntent] = useState<SettingsOpenIntent | null>(null);
  const requestedSettingsTab = settingsQuery.settingsTab ?? undefined;
  const requestedSettingsBoardId = settingsQuery.settingsBoardId ?? undefined;
  const linkedProvider = settingsQuery.settingsLinkedProvider ?? undefined;
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

      setOpenIntent({
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
  }, []);

  useEffect(() => {
    if (requestedSettingsOpen && SettingsDialog) {
      setOpenIntent(null);
    }
  }, [requestedSettingsOpen, SettingsDialog]);

  const openSettingsDialog = useCallback(() => {
    const routeBoardId = getRouteParam(params, 'boardId');
    const shouldOpenBoardSettings = Boolean(
      routeBoardId && pathname?.includes('/tasks/boards/')
    );

    if (shouldOpenBoardSettings) {
      window.dispatchEvent(
        new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
          detail: {
            settingsBoardId: routeBoardId,
            settingsTab: 'task_board',
          },
        })
      );
    }

    void setSettingsQuery(
      {
        settingsDialog: 'open',
        settingsTab: shouldOpenBoardSettings ? 'task_board' : null,
        settingsBoardId: shouldOpenBoardSettings ? routeBoardId : null,
        settingsLinkedProvider: null,
      },
      {
        history: 'replace',
        shallow: true,
        scroll: false,
      }
    );
  }, [params, pathname, setSettingsQuery]);

  useSettingsDialogShortcut({
    enabled: Boolean(user),
    onOpen: openSettingsDialog,
  });

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpenIntent(null);
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
