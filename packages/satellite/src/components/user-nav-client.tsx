'use client';

import { logoutCurrentWebAccountWithInternalApi } from '@tuturuuu/internal-api/auth';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import { SatelliteUserMenuItems } from '@tuturuuu/ui/custom/satellite-user-menu-items';
import { Dialog } from '@tuturuuu/ui/dialog';
import { DropdownMenuSeparator } from '@tuturuuu/ui/dropdown-menu';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { ReportProblemDialog } from '@tuturuuu/ui/report-problem-dialog';
import { useTranslations } from 'next-intl';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { SidebarContext } from '../context/sidebar-context';
import { SatelliteAccountSwitcherMenu } from './account-switcher-menu';
import { AppGuideOverlay } from './app-guide-overlay';
import { GuidanceSettingsDialog } from './guidance-settings-dialog';
import { LanguageWrapper } from './language-wrapper';
import { claimSettingsDialogIntent } from './settings-dialog-intent';
import { shouldOwnSettingsDialog } from './settings-dialog-ownership';
import { SystemLanguageWrapper } from './system-language-wrapper';
import { ThemeDropdownItems } from './theme-dropdown-items';
import { resolveUserNavSecondaryLabel } from './user-nav-metadata';
import { useWorkspaceSelector } from './workspace-selector-context';

interface UserNavClientProps {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
  /** The app name used in the logout redirect URL (e.g., "Rewise", "Tasks") */
  appName?: string;
  /** The URL of the central Tuturuuu web app */
  ttrUrl?: string;
  /** Optional settings dialog component. Receives wsId and user as props. */
  settingsDialog?: ReactNode;
  /** Let an app-level host own settings URL state, shortcuts, and rendering. */
  externalSettingsHost?: boolean;
}

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
  appName = 'App',
  ttrUrl,
  settingsDialog,
  externalSettingsHost = false,
}: UserNavClientProps) {
  const t = useTranslations();

  const sidebar = useContext(SidebarContext);
  const workspaceSelector = useWorkspaceSelector();
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsQuery, setSettingsQuery] = useQueryStates(
    {
      settingsDialog: parseAsStringLiteral(['open']),
      settingsTab: parseAsString,
    },
    {
      history: 'replace',
      shallow: true,
      scroll: false,
    }
  );
  const settingsOpen = settingsQuery.settingsDialog === 'open';
  const effectiveSettingsDialog = settingsDialog ?? <GuidanceSettingsDialog />;
  const ownsSettingsDialog = shouldOwnSettingsDialog(externalSettingsHost);

  // Cmd/Ctrl+, opens the app settings dialog — platform-wide convention, wired
  // once here so every satellite app (calendar/tasks/finance/…) gets it.
  const openSettings = useCallback(() => {
    void setSettingsQuery({
      settingsDialog: 'open',
      settingsTab: null,
    });
  }, [setSettingsQuery]);
  useSettingsDialogShortcut({
    enabled: Boolean(user) && ownsSettingsDialog,
    onOpen: openSettings,
  });

  useEffect(() => {
    if (!ownsSettingsDialog) return;

    const handleSettingsIntent = (event: Event) => {
      if (!claimSettingsDialogIntent(event)) return;

      const tab = (event as CustomEvent<{ settingsTab?: string }>).detail
        ?.settingsTab;
      void setSettingsQuery({
        settingsDialog: 'open',
        settingsTab: tab ?? null,
      });
    };

    window.addEventListener(
      'tuturuuu:settings-dialog-open-intent',
      handleSettingsIntent
    );
    return () =>
      window.removeEventListener(
        'tuturuuu:settings-dialog-open-intent',
        handleSettingsIntent
      );
  }, [ownsSettingsDialog, setSettingsQuery]);

  useEffect(() => {
    const closeSettings = () =>
      void setSettingsQuery({ settingsDialog: null, settingsTab: null });
    const openFeedback = () => setReportOpen(true);

    window.addEventListener(
      'tuturuuu:settings-dialog-close-intent',
      closeSettings
    );
    window.addEventListener(
      'tuturuuu:report-problem-open-intent',
      openFeedback
    );
    return () => {
      window.removeEventListener(
        'tuturuuu:settings-dialog-close-intent',
        closeSettings
      );
      window.removeEventListener(
        'tuturuuu:report-problem-open-intent',
        openFeedback
      );
    };
  }, [setSettingsQuery]);

  const renderedSettingsDialog = isValidElement(effectiveSettingsDialog)
    ? cloneElement(effectiveSettingsDialog, {
        defaultTab: settingsQuery.settingsTab ?? undefined,
        key: settingsQuery.settingsTab ?? 'default',
      } as Record<string, unknown>)
    : effectiveSettingsDialog;

  const centralUrl =
    ttrUrl ??
    (process.env.NODE_ENV === 'production'
      ? 'https://tuturuuu.com'
      : `http://localhost:${process.env.CENTRAL_PORT || 7803}`);
  const secondaryLabel = resolveUserNavSecondaryLabel({
    email: user?.email,
    workspaceName: workspaceSelector?.workspace.name,
    workspacePersonal: workspaceSelector?.workspace.personal ?? undefined,
    workspaceSelectorVisible: workspaceSelector?.visible ?? true,
  });

  const handleLogout = async () => {
    await logoutCurrentWebAccountWithInternalApi({
      baseUrl: centralUrl,
    }).catch(() => null);
    await fetch('/api/auth/logout', {
      cache: 'no-store',
      method: 'POST',
    }).catch(() => null);
    window.location.assign(`${centralUrl}/logout?from=${appName}`);
  };

  return (
    <>
      <ReportProblemDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        showTrigger={false}
      />
      <AppGuideOverlay />

      {user && ownsSettingsDialog && (
        <Dialog
          open={settingsOpen}
          onOpenChange={(open) => {
            if (open) return;
            void setSettingsQuery({
              settingsDialog: null,
              settingsTab: null,
            });
          }}
        >
          {renderedSettingsDialog}
        </Dialog>
      )}

      <SatelliteUserMenu
        name={user?.display_name || user?.handle || t('common.unnamed')}
        email={user?.email}
        avatarUrl={user?.avatar_url}
        secondaryLabel={secondaryLabel}
        hideMetadata={hideMetadata}
        online={Boolean(user)}
      >
        <SatelliteUserMenuItems
          centralUrl={centralUrl}
          t={t}
          sidebar={sidebar}
          signedIn={Boolean(user)}
          workspaceSelect={workspaceSelector?.renderWorkspaceSelect?.({
            isCollapsed: false,
            standalone: true,
          })}
          languageItems={
            <>
              <LanguageWrapper
                locale="en"
                label="English"
                currentLocale={locale}
              />
              <LanguageWrapper
                locale="vi"
                label="Tiếng Việt"
                currentLocale={locale}
              />
              <DropdownMenuSeparator />
              <SystemLanguageWrapper currentLocale={locale} />
            </>
          }
          themeItems={<ThemeDropdownItems />}
          accountItems={
            <SatelliteAccountSwitcherMenu
              centralUrl={centralUrl}
              workspaceId={workspaceSelector?.workspace.id}
            />
          }
          onReport={() => setReportOpen(true)}
          onLogout={handleLogout}
        />
      </SatelliteUserMenu>
    </>
  );
}

// Re-export the wsId for consumers that need it
export type { UserNavClientProps };
