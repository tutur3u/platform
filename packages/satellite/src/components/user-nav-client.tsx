'use client';

import { logoutCurrentWebAccountWithInternalApi } from '@tuturuuu/internal-api/auth';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import { SatelliteUserMenuItems } from '@tuturuuu/ui/custom/satellite-user-menu-items';
import { Dialog } from '@tuturuuu/ui/dialog';
import { DropdownMenuSeparator } from '@tuturuuu/ui/dropdown-menu';
import {
  SETTINGS_DIALOG_CLOSE_INTENT_EVENT,
  SETTINGS_DIALOG_OPEN_INTENT_EVENT,
} from '@tuturuuu/ui/hooks/settings-dialog-url';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import { ReportProblemDialog } from '@tuturuuu/ui/report-problem-dialog';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { getPublicProfileUrl } from '@tuturuuu/utils/public-profile-url';
import { useTranslations } from 'next-intl';
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
import { SatelliteDefaultSettingsDialog } from './account-settings/default-settings-dialog';
import { SatelliteAccountSwitcherMenu } from './account-switcher-menu';
import { AppGuideOverlay } from './app-guide-overlay';
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
  const { modKey } = usePlatform();
  const {
    closeSettings,
    open: settingsOpen,
    openSettings: openSettingsTab,
    tab: settingsTab,
  } = useSettingsDialogUrlState();
  const ownsSettingsDialog = shouldOwnSettingsDialog(externalSettingsHost);

  // Cmd/Ctrl+, opens the app settings dialog — platform-wide convention, wired
  // once here so every satellite app (calendar/tasks/finance/…) gets it.
  const openSettings = useCallback(() => {
    openSettingsTab(null);
  }, [openSettingsTab]);
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
      openSettingsTab(tab ?? null);
    };

    window.addEventListener(
      SETTINGS_DIALOG_OPEN_INTENT_EVENT,
      handleSettingsIntent
    );
    return () =>
      window.removeEventListener(
        SETTINGS_DIALOG_OPEN_INTENT_EVENT,
        handleSettingsIntent
      );
  }, [openSettingsTab, ownsSettingsDialog]);

  useEffect(() => {
    const openFeedback = () => setReportOpen(true);

    window.addEventListener(SETTINGS_DIALOG_CLOSE_INTENT_EVENT, closeSettings);
    window.addEventListener(
      'tuturuuu:report-problem-open-intent',
      openFeedback
    );
    return () => {
      window.removeEventListener(
        SETTINGS_DIALOG_CLOSE_INTENT_EVENT,
        closeSettings
      );
      window.removeEventListener(
        'tuturuuu:report-problem-open-intent',
        openFeedback
      );
    };
  }, [closeSettings]);

  const centralUrl =
    ttrUrl ??
    (process.env.NODE_ENV === 'production'
      ? 'https://tuturuuu.com'
      : `http://localhost:${process.env.CENTRAL_PORT || 7803}`);
  // Apps without their own dialog still get the shared account tabs.
  const effectiveSettingsDialog = settingsDialog ?? (
    <SatelliteDefaultSettingsDialog centralUrl={centralUrl} user={user} />
  );
  const renderedSettingsDialog = isValidElement(effectiveSettingsDialog)
    ? cloneElement(effectiveSettingsDialog, {
        defaultTab: settingsTab ?? undefined,
        key: settingsTab ?? 'default',
      } as Record<string, unknown>)
    : effectiveSettingsDialog;

  const publicProfileUrl = getPublicProfileUrl(user?.handle, centralUrl);
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
            closeSettings();
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
          settings={
            user
              ? {
                  label: t('common.settings'),
                  onOpen: openSettings,
                  shortcut: `${modKey},`,
                }
              : undefined
          }
          publicProfile={
            publicProfileUrl
              ? { href: publicProfileUrl, label: t('common.public_profile') }
              : undefined
          }
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
