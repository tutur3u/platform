'use client';

import {
  Check,
  Globe,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  SquareMousePointer,
  Terminal,
  User,
  Users,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import Link from 'next/link';
import { notFound, redirect, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { AccountSwitcherModal } from '@/components/account-switcher';
import { CommandPalette } from '@/components/command';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { SidebarContext } from '@/context/sidebar-context';
import { LanguageWrapper } from './(dashboard)/_components/language-wrapper';
import { LogoutDropdownItem } from './(dashboard)/_components/logout-dropdown-item';
import { SystemLanguageWrapper } from './(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownItems } from './(dashboard)/_components/theme-dropdown-items';
import DashboardMenuItem from './dashboard-menu-item';
import InviteMembersMenuItem from './invite-members-menu-item';
import MeetTogetherMenuItem from './meet-together-menu-item';
import ReportProblemMenuItem from './report-problem-menu-item';
import RewiseMenuItem from './rewise-menu-item';
import UserPresenceIndicator from './user-presence-indicator';

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
  workspace,
}: {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
  workspace?: Workspace | null;
}) {
  const t = useTranslations();

  const params = useParams();
  const [wsId, setWsId] = useState<string>();

  useEffect(() => {
    const fetchWorkspace = async () => {
      const workspace = await getWorkspace(params?.wsId as string | undefined);
      if (workspace) setWsId(workspace.id);
    };
    fetchWorkspace();
  }, [params]);

  const [open, setOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const sidebar = useContext(SidebarContext);
  const { accounts } = useAccountSwitcher();

  return (
    <>
      {wsId && (
        <CommandPalette
          open={commandPaletteOpen}
          setOpen={setCommandPaletteOpen}
        />
      )}
      {user && (
        <Dialog open={open} onOpenChange={setOpen}>
          <SettingsDialog wsId={wsId} user={user} workspace={workspace} />
        </Dialog>
      )}
      <AccountSwitcherModal
        open={accountSwitcherOpen}
        onOpenChange={setAccountSwitcherOpen}
      />

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
                <div className="line-clamp-1 break-all text-xs opacity-70">
                  {user?.email}
                </div>
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
              <Link
                href="/settings/account"
                className="line-clamp-1 w-fit break-all font-medium text-sm hover:underline"
              >
                {user?.display_name || user?.handle || t('common.unnamed')}
              </Link>
              <p className="line-clamp-1 break-all text-xs opacity-70">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DashboardMenuItem />
          <RewiseMenuItem />
          <MeetTogetherMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {wsId && (
              <>
                <DropdownMenuItem onSelect={() => setCommandPaletteOpen(true)}>
                  <Terminal className="h-4 w-4 text-dynamic-blue" />
                  <span>Command Palette</span>
                  <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
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
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => setOpen(true)}
            >
              <Settings className="h-4 w-4" />
              <span>{t('common.settings')}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <InviteMembersMenuItem />
          <DropdownMenuSeparator />
          {accounts.length >= 2 ? (
            <DropdownMenuItem
              onSelect={() => setAccountSwitcherOpen(true)}
              className="cursor-pointer"
            >
              <Users className="h-4 w-4 text-dynamic-orange" />
              <span>{t('account_switcher.switch_account')}</span>
              <DropdownMenuShortcut>⌘⇧A</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link
                href="/settings/account/accounts"
                className="cursor-pointer"
              >
                <Users className="h-4 w-4 text-dynamic-orange" />
                <span>{t('account_switcher.manage_accounts')}</span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <LogoutDropdownItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export async function getWorkspace(
  id?: string,
  {
    requireUserRole = false,
  }: {
    requireUserRole?: boolean;
  } = {}
) {
  if (!id) return null;

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const queryBuilder = supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members(user_id)'
    );

  const resolvedWorkspaceId = resolveWorkspaceId(id);

  if (id?.toUpperCase() === 'PERSONAL') queryBuilder.eq('personal', true);
  else queryBuilder.eq('id', resolvedWorkspaceId);

  if (requireUserRole) queryBuilder.eq('workspace_members.user_id', user.id);
  const { data, error } = await queryBuilder.single();

  // If there's an error, log it for debugging with structured logging
  if (error) {
    console.error('Error fetching workspace:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Return null to let the caller handle the error appropriately
    // This allows for more graceful error handling in different contexts
    notFound();
  }

  const workspaceJoined = !!data?.workspace_members[0]?.user_id;
  const { workspace_members: _, ...rest } = data;

  const ws = {
    ...rest,
    joined: workspaceJoined,
  };

  return ws as Workspace & {
    joined: boolean;
  };
}
