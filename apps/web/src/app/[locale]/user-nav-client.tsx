'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Globe,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  SquareMousePointer,
  Terminal,
  User,
  Users,
} from '@tuturuuu/icons/lucide-static';
import { resolveUserNavSecondaryLabel } from '@tuturuuu/satellite/user-nav-metadata';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { AnimatedSlotText } from '@tuturuuu/ui/custom/animated-slot-text';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { getInitials } from '@tuturuuu/utils/name-helper';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import type { ComponentType } from 'react';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { NavLink } from '@/components/navigation';
import { SettingsDialogFullscreenSkeleton } from '@/components/settings/settings-dialog-skeleton';
import { useSettingsDialogShortcut } from '@/components/settings/use-settings-dialog-shortcut';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { SidebarContext } from '@/context/sidebar-context';
import { apiFetch } from '@/lib/api-fetch';
import { LanguageWrapper } from './(dashboard)/_components/language-wrapper';
import { LogoutDropdownItem } from './(dashboard)/_components/logout-dropdown-item';
import { SystemLanguageWrapper } from './(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownItems } from './(dashboard)/_components/theme-dropdown-items';
import { fetchWorkspaces } from './(dashboard)/[wsId]/workspace-list-actions';
import { useWorkspaceSelectorVisibility } from './(dashboard)/[wsId]/workspace-selector-visibility-context';
import DashboardMenuItem from './dashboard-menu-item';
import InviteMembersMenuItem from './invite-members-menu-item';
import MeetTogetherMenuItem from './meet-together-menu-item';
import ReportProblemMenuItem from './report-problem-menu-item';
import RewiseMenuItem from './rewise-menu-item';
import type { UserNavSettingsDialogProps } from './user-nav-settings-dialog';
import UserPresenceIndicator from './user-presence-indicator';

const AccountSwitcherModal = dynamic(
  () =>
    import('@/components/account-switcher').then(
      (module) => module.AccountSwitcherModal
    ),
  { ssr: false }
);
const UserNavCommandLauncher = dynamic(
  () =>
    import('./user-nav-command-launcher').then(
      (module) => module.UserNavCommandLauncher
    ),
  { ssr: false }
);
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
  const t = useTranslations();
  const params = useParams();
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const sidebar = useContext(SidebarContext);
  const workspaceSelectorVisible = useWorkspaceSelectorVisibility();
  const { accounts } = useAccountSwitcher();
  const { modKey } = usePlatform();
  const settingsDialogEnabled = Boolean(user && renderSettingsDialog);
  const UserNavSettingsDialog = useUserNavSettingsDialogComponent(
    settingsDialogEnabled
  );
  const wsIdParam = typeof params?.wsId === 'string' ? params.wsId : undefined;
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
  const requestedSettingsTab = settingsQuery.settingsTab ?? undefined;
  const linkedProvider = settingsQuery.settingsLinkedProvider ?? undefined;

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
  const secondaryLabel = resolveUserNavSecondaryLabel({
    email: user?.email,
    workspaceName: displayedWorkspace?.name,
    workspacePersonal: displayedWorkspace?.personal,
    workspaceSelectorVisible,
  });

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
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

  const openSettingsDialog = useCallback(
    (tab?: string) => {
      void setSettingsQuery(
        {
          settingsDialog: 'open',
          settingsTab: tab ?? null,
          settingsBoardId: null,
          settingsLinkedProvider: null,
        },
        {
          history: 'replace',
          shallow: true,
          scroll: false,
        }
      );
    },
    [setSettingsQuery]
  );

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
      {accountSwitcherOpen && (
        <AccountSwitcherModal
          open={accountSwitcherOpen}
          onOpenChange={setAccountSwitcherOpen}
        />
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-10 w-full gap-2 rounded-md p-1 text-start transition',
              hideMetadata
                ? 'items-center justify-center'
                : 'items-center justify-start hover:bg-foreground/5'
            )}
          >
            <Avatar className="relative h-8 w-8 cursor-pointer overflow-visible font-semibold">
              <AvatarImage
                src={user?.avatar_url ?? undefined}
                className="aspect-square overflow-clip rounded-lg object-cover"
              />
              <AvatarFallback className="rounded-lg font-semibold">
                {user?.display_name ? (
                  getInitials(user.display_name)
                ) : (
                  <User className="h-5 w-5" />
                )}
              </AvatarFallback>
              <UserPresenceIndicator className="-right-1 -bottom-1 h-3 w-3 border-2" />
            </Avatar>
            {hideMetadata || (
              <div className="flex w-full flex-col items-start justify-center">
                <div className="line-clamp-1 break-all font-semibold text-sm">
                  {user?.display_name || user?.handle || t('common.unnamed')}
                </div>
                <AnimatedSlotText
                  className="text-xs opacity-70"
                  text={secondaryLabel}
                />
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56"
          side="right"
          align="end"
          forceMount
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => openSettingsDialog('profile')}
                className="line-clamp-1 w-fit break-all font-medium text-sm hover:underline"
              >
                {user?.display_name || user?.handle || t('common.unnamed')}
              </button>
              <p className="line-clamp-1 break-all text-xs opacity-70">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {wsId && (
            <>
              <div className="px-1.5 pb-1.5">
                <WorkspaceSelect
                  disableCreateNewWorkspace
                  fallbackLogoUrl={TUTURUUU_LOCAL_LOGO_URL}
                  fetchWorkspaces={fetchWorkspaces}
                  showTierBadges={false}
                  standalone
                  triggerClassName="h-8 border-border/70 bg-muted/30 px-2 shadow-none hover:bg-muted/60"
                  wsId={wsId}
                />
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DashboardMenuItem />
          <RewiseMenuItem />
          <MeetTogetherMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {wsId && (
              <>
                <DropdownMenuItem onSelect={openCommandLauncher}>
                  <Terminal className="h-4 w-4 text-dynamic-blue" />
                  <span>Command Palette</span>
                  <DropdownMenuShortcut>{modKey}K</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
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
            <ReportProblemMenuItem />
          </DropdownMenuGroup>
          {wsId && (
            <>
              <DropdownMenuSeparator />
              <InviteMembersMenuItem />
            </>
          )}
          <DropdownMenuSeparator />
          {accounts.length >= 2 ? (
            <DropdownMenuItem
              onSelect={() => setAccountSwitcherOpen(true)}
              className="cursor-pointer"
            >
              <Users className="h-4 w-4 text-dynamic-orange" />
              <span>{t('account_switcher.switch_account')}</span>
              <DropdownMenuShortcut>{modKey}⇧A</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => openSettingsDialog('accounts')}
              className="cursor-pointer"
            >
              <Users className="h-4 w-4 text-dynamic-orange" />
              <span>{t('account_switcher.manage_accounts')}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <LogoutDropdownItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
