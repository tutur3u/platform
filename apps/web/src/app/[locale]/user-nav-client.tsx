'use client';

import { useQuery } from '@tanstack/react-query';
import { resolveUserNavSecondaryLabel } from '@tuturuuu/satellite/user-nav-metadata';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  SETTINGS_DIALOG_CLOSE_INTENT_EVENT,
  SETTINGS_DIALOG_OPEN_INTENT_EVENT,
} from '@tuturuuu/ui/hooks/settings-dialog-url';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavLink } from '@/components/navigation';
import { SettingsDialogFullscreenSkeleton } from '@/components/settings/settings-dialog-skeleton';
import { useSettingsDialogShortcut } from '@/components/settings/use-settings-dialog-shortcut';
import { apiFetch } from '@/lib/api-fetch';
import { useWorkspaceSelectorVisibility } from './(dashboard)/[wsId]/workspace-selector-visibility-context';
import ReportProblemHost from './report-problem-host';
import { CommandPaletteMenuItem, UserNavMenu } from './user-nav-menu';
import type { UserNavSettingsDialogProps } from './user-nav-settings-dialog';

const UserNavCommandLauncher = dynamic(
  () =>
    import('./user-nav-command-launcher').then(
      (module) => module.UserNavCommandLauncher
    ),
  { ssr: false }
);
const SETTINGS_EXTRA_KEYS = [
  'settingsBoardId',
  'settingsLinkedProvider',
] as const;

function useUserNavSettingsDialogComponent(enabled: boolean) {
  const [UserNavSettingsDialog, setUserNavSettingsDialog] =
    useState<ComponentType<UserNavSettingsDialogProps> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    void import('./user-nav-settings-dialog').then((module) => {
      if (active) setUserNavSettingsDialog(() => module.UserNavSettingsDialog);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return UserNavSettingsDialog;
}

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
  workspace,
  renderCommandLauncher = true,
  renderSettingsDialog = true,
  navLinks = [],
}: {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
  workspace?: Workspace | null;
  renderCommandLauncher?: boolean;
  renderSettingsDialog?: boolean;
  navLinks?: (NavLink | null)[];
}) {
  const params = useParams();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const workspaceSelectorVisible = useWorkspaceSelectorVisibility();
  const settingsDialogEnabled = Boolean(user && renderSettingsDialog);
  const UserNavSettingsDialog = useUserNavSettingsDialogComponent(
    settingsDialogEnabled
  );
  const wsIdParam = typeof params?.wsId === 'string' ? params.wsId : undefined;
  const {
    closeSettings,
    extras: settingsExtras,
    open: requestedSettingsOpen,
    openSettings,
    tab: settingsTab,
  } = useSettingsDialogUrlState(SETTINGS_EXTRA_KEYS);
  const requestedSettingsTab = settingsTab ?? undefined;
  const linkedProvider = settingsExtras.settingsLinkedProvider ?? undefined;

  const { data: resolvedWorkspace } = useQuery({
    queryKey: ['user-nav-workspace', wsIdParam],
    queryFn: () =>
      apiFetch<Workspace>(`/api/workspaces/${wsIdParam}`, {
        cache: 'no-store',
      }),
    enabled: !workspace?.id && !!wsIdParam,
  });

  const wsId = workspace?.id ?? resolvedWorkspace?.id;
  const displayedWorkspace = workspace ?? resolvedWorkspace;
  const userName = resolveUserDisplayName(user);
  const secondaryLabel = resolveUserNavSecondaryLabel({
    email: user?.email,
    workspaceName: displayedWorkspace?.name,
    workspacePersonal: displayedWorkspace?.personal,
    workspaceSelectorVisible,
  });

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) closeSettings();
  };

  const openSettingsDialog = useCallback(
    (tab?: string) => {
      if (
        !renderSettingsDialog &&
        !window.dispatchEvent(
          new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
            cancelable: true,
            detail: { returnFocus: menuTrigger.current, settingsTab: tab },
          })
        )
      ) {
        return;
      }
      openSettings(tab ?? null);
    },
    [openSettings, renderSettingsDialog]
  );

  useEffect(() => {
    window.addEventListener(SETTINGS_DIALOG_CLOSE_INTENT_EVENT, closeSettings);
    return () =>
      window.removeEventListener(
        SETTINGS_DIALOG_CLOSE_INTENT_EVENT,
        closeSettings
      );
  }, [closeSettings]);

  const openCommandLauncher = useCallback(() => {
    void import('@tuturuuu/satellite/command-launcher').then((module) => {
      module.openGlobalCommandLauncher();
    });
  }, []);

  useSettingsDialogShortcut({
    enabled: settingsDialogEnabled,
    onOpen: openSettingsDialog,
  });

  return (
    <>
      {renderCommandLauncher && (
        <UserNavCommandLauncher
          locale={locale}
          navLinks={navLinks}
          workspace={workspace ?? resolvedWorkspace}
          wsId={wsId}
        />
      )}
      {user && renderSettingsDialog && UserNavSettingsDialog && (
        <UserNavSettingsDialog
          defaultTab={requestedSettingsTab}
          linkedProvider={linkedProvider}
          open={requestedSettingsOpen}
          onOpenChange={handleSettingsOpenChange}
          user={user}
          workspace={workspace ?? resolvedWorkspace}
          wsId={wsId}
        />
      )}
      {user &&
        renderSettingsDialog &&
        requestedSettingsOpen &&
        !UserNavSettingsDialog && (
          <Dialog open onOpenChange={handleSettingsOpenChange}>
            <SettingsDialogFullscreenSkeleton />
          </Dialog>
        )}
      <ReportProblemHost />
      <UserNavMenu
        user={user}
        userName={userName}
        locale={locale}
        hideMetadata={hideMetadata}
        secondaryLabel={secondaryLabel}
        wsId={wsId}
        triggerRef={menuTrigger}
        appItems={
          wsId ? <CommandPaletteMenuItem onOpen={openCommandLauncher} /> : null
        }
        onOpenSettings={openSettingsDialog}
      />
    </>
  );
}
