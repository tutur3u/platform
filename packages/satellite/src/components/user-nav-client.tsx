'use client';

import {
  AlertTriangle,
  Check,
  ExternalLink,
  Globe,
  LogOut,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  SquareMousePointer,
} from '@tuturuuu/icons';
import { logoutCurrentWebAccountWithInternalApi } from '@tuturuuu/internal-api/auth';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
        {workspaceSelector?.renderWorkspaceSelect ? (
          <>
            <div className="w-full p-1 [&_[data-slot=popover-trigger]]:h-9">
              {workspaceSelector.renderWorkspaceSelect({
                isCollapsed: false,
                standalone: true,
              })}
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a
              href={centralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              <ExternalLink className="h-4 w-4 text-dynamic-green" />
              <span>{t('common.dashboard')}</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {sidebar && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="hidden md:flex">
                <PanelLeft className="h-4 w-4 text-dynamic-purple" />
                <span>{t('common.sidebar')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent sideOffset={4}>
                  <DropdownMenuItem
                    onClick={() => sidebar.handleBehaviorChange('expanded')}
                    disabled={sidebar.behavior === 'expanded'}
                  >
                    <PanelLeftOpen className="h-4 w-4 text-dynamic-purple" />
                    <span>{t('common.expanded')}</span>
                    {sidebar.behavior === 'expanded' && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => sidebar.handleBehaviorChange('collapsed')}
                    disabled={sidebar.behavior === 'collapsed'}
                  >
                    <PanelLeftClose className="h-4 w-4 text-dynamic-purple" />
                    <span>{t('common.collapsed')}</span>
                    {sidebar.behavior === 'collapsed' && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => sidebar.handleBehaviorChange('hover')}
                    disabled={sidebar.behavior === 'hover'}
                  >
                    <SquareMousePointer className="h-4 w-4 text-dynamic-purple" />
                    <span>{t('common.expand_on_hover')}</span>
                    {sidebar.behavior === 'hover' && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => sidebar.handleBehaviorChange('hidden')}
                    disabled={sidebar.behavior === 'hidden'}
                  >
                    <PanelLeft className="h-4 w-4 text-dynamic-purple" />
                    <span>{t('common.hidden')}</span>
                    {sidebar.behavior === 'hidden' && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="h-4 w-4 text-dynamic-indigo" />
              <span>{t('common.language')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={4}>
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
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="h-4 w-4 text-dynamic-cyan" />
              <span>{t('common.theme')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={4}>
                <ThemeDropdownItems />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              setReportOpen(true);
            }}
          >
            <AlertTriangle className="h-4 w-4 text-dynamic-yellow" />
            <span>{t('common.report-problem')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {user && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <SatelliteAccountSwitcherMenu
                centralUrl={centralUrl}
                workspaceId={workspaceSelector?.workspace.id}
              />
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="h-4 w-4 text-dynamic-red" />
          <span>{t('common.logout')}</span>
        </DropdownMenuItem>
      </SatelliteUserMenu>
    </>
  );
}

// Re-export the wsId for consumers that need it
export type { UserNavClientProps };
