'use client';

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
import { createLogoutConfirmationUrl } from '@tuturuuu/utils/logout-target';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { SidebarContext } from '../context/sidebar-context';
import {
  SatelliteDefaultSettingsDialog,
  type SatelliteSidebarSettingsTab,
} from './account-settings/default-settings-dialog';
import { SatelliteAccountSwitcherMenu } from './account-switcher-menu';
import { AppGuideOverlay } from './app-guide-overlay';
import { LanguageWrapper } from './language-wrapper';
import { claimSettingsDialogIntent } from './settings-dialog-intent';
import { shouldOwnSettingsDialog } from './settings-dialog-ownership';
import { SystemLanguageWrapper } from './system-language-wrapper';
import { ThemeDropdownItems } from './theme-dropdown-items';
import { resolveUserNavSecondaryLabel } from './user-nav-metadata';
import { useWorkspaceSelector } from './workspace-selector-context';
import { announceSessionEnding } from '@tuturuuu/utils/session-events';

interface SettingsDialogProps {
  user: WorkspaceUser | null;
  /** Optional settings dialog component. Receives wsId and user as props. */
  settingsDialog?: ReactNode;
  /** Sidebar tab for apps using the shared settings dialog. */
  sidebarSettingsTab?: SatelliteSidebarSettingsTab;
  /** Verified server-side eligibility for app-owned settings. */
  canManageVersionBadge?: boolean;
}

interface UserNavClientProps extends SettingsDialogProps {
  locale: string | undefined;
  hideMetadata?: boolean;
  /** The app name used in the logout redirect URL (e.g., "Rewise", "Tasks") */
  appName?: string;
  /** The URL of the central Tuturuuu web app */
  ttrUrl?: string;
  /** Let an app-level host own settings URL state, shortcuts, and rendering. */
  externalSettingsHost?: boolean;
}

const defaultCentralUrl =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${process.env.CENTRAL_PORT || 7803}`;

export function SatelliteSettingsDialogHost({
  canManageVersionBadge,
  centralUrl = defaultCentralUrl,
  settingsDialog,
  sidebarSettingsTab,
  user,
}: SettingsDialogProps & { centralUrl?: string }) {
  const { closeSettings, open, openSettings, tab } =
    useSettingsDialogUrlState();
  const signedIn = Boolean(user);
  const dialogOpen = useRef(open);
  const returnFocus = useRef<{
    origin: HTMLElement;
    minimalSidebar: HTMLElement | null;
  } | null>(null);
  useLayoutEffect(() => {
    dialogOpen.current = open;
  }, [open]);
  const openFromCurrentControl = useCallback(
    (nextTab: string | null) => {
      const origin = document.activeElement;
      if (!open && origin instanceof HTMLElement && origin !== document.body) {
        returnFocus.current = {
          origin,
          minimalSidebar: origin.closest('[data-minimal-sidebar]'),
        };
      }
      openSettings(nextTab);
    },
    [open, openSettings]
  );
  const openDefaultSettings = useCallback(() => {
    openFromCurrentControl(null);
  }, [openFromCurrentControl]);
  useSettingsDialogShortcut({
    enabled: signedIn,
    onOpen: openDefaultSettings,
  });

  useEffect(() => {
    if (!signedIn) return;

    const handleSettingsIntent = (event: Event) => {
      if (!claimSettingsDialogIntent(event)) return;

      const tab = (event as CustomEvent<{ settingsTab?: string }>).detail
        ?.settingsTab;
      openFromCurrentControl(tab ?? null);
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
  }, [openFromCurrentControl, signedIn]);

  if (!user) return null;

  const content = settingsDialog ?? (
    <SatelliteDefaultSettingsDialog
      canManageVersionBadge={canManageVersionBadge}
      centralUrl={centralUrl}
      onCloseAutoFocus={(event) => {
        if (dialogOpen.current || !returnFocus.current) return;
        const { origin, minimalSidebar } = returnFocus.current;
        returnFocus.current = null;
        const target =
          origin.isConnected &&
          !origin.closest('[inert]') &&
          origin.checkVisibility?.({ visibilityProperty: true }) !== false
            ? origin
            : minimalSidebar?.querySelector<HTMLElement>(
                '[data-sidebar-reveal-trigger]'
              );
        if (!target?.isConnected) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
      }}
      sidebarTab={sidebarSettingsTab}
      user={user}
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeSettings();
      }}
    >
      {isValidElement(content)
        ? cloneElement(content, {
            defaultTab: tab ?? undefined,
            key: tab ?? 'default',
          } as Record<string, unknown>)
        : content}
    </Dialog>
  );
}

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
  ttrUrl,
  settingsDialog,
  sidebarSettingsTab,
  canManageVersionBadge,
  externalSettingsHost = false,
}: UserNavClientProps) {
  const t = useTranslations();
  const router = useRouter();

  const sidebar = useContext(SidebarContext);
  const workspaceSelector = useWorkspaceSelector();
  const [reportOpen, setReportOpen] = useState(false);
  const { modKey } = usePlatform();
  const { closeSettings, openSettings: openSettingsTab } =
    useSettingsDialogUrlState();
  const ownsSettingsDialog = shouldOwnSettingsDialog(externalSettingsHost);

  const openSettings = useCallback(() => {
    openSettingsTab(null);
  }, [openSettingsTab]);

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

  const centralUrl = ttrUrl ?? defaultCentralUrl;
  const publicProfileUrl = getPublicProfileUrl(user?.handle, centralUrl);
  const secondaryLabel = resolveUserNavSecondaryLabel({
    email: user?.email,
    workspaceName: workspaceSelector?.workspace.name,
    workspacePersonal: workspaceSelector?.workspace.personal ?? undefined,
    workspaceSelectorVisible: workspaceSelector?.visible ?? true,
  });

  const handleLogout = () => {
    announceSessionEnding();
    router.push(
      createLogoutConfirmationUrl({
        centralUrl,
        appOrigin: window.location.origin,
        locale,
      })
    );
  };

  return (
    <>
      <ReportProblemDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        showTrigger={false}
      />
      <AppGuideOverlay />

      {ownsSettingsDialog && (
        <SatelliteSettingsDialogHost
          canManageVersionBadge={canManageVersionBadge}
          centralUrl={centralUrl}
          settingsDialog={settingsDialog}
          sidebarSettingsTab={sidebarSettingsTab}
          user={user}
        />
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
