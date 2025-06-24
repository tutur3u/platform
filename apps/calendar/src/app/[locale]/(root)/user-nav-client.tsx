'use client';

import { LanguageWrapper } from './_components/language-wrapper';
import { LogoutDropdownItem } from './_components/logout-dropdown-item';
import { SystemLanguageWrapper } from './_components/system-language-wrapper';
import { ThemeDropdownItems } from './_components/theme-dropdown-items';
import DashboardMenuItem from './dashboard-menu-item';
import InviteMembersMenuItem from './invite-members-menu-item';
import MeetTogetherMenuItem from './meet-together-menu-item';
import RewiseMenuItem from './rewise-menu-item';
import UserSettingsDialog from './settings-dialog';
import UserPresenceIndicator from './user-presence-indicator';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Globe, Palette, Settings, User } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
}: {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      {user && (
        <Dialog open={open} onOpenChange={setOpen}>
          <UserSettingsDialog user={user} />
        </Dialog>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex h-10 w-full gap-3 rounded-lg p-2 text-start transition-all duration-200',
              hideMetadata
                ? 'items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800'
                : 'items-center justify-start hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            <Avatar className="relative cursor-pointer overflow-visible font-semibold ring-2 ring-white dark:ring-gray-800">
              <AvatarImage
                src={user?.avatar_url ?? undefined}
                className="overflow-clip rounded-lg"
              />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 font-semibold text-white">
                {user?.display_name ? (
                  getInitials(user.display_name)
                ) : (
                  <User className="h-5 w-5" />
                )}
              </AvatarFallback>
              <UserPresenceIndicator className="-right-1 -bottom-1 h-3 w-3 border-2 border-white dark:border-gray-800" />
            </Avatar>
            {hideMetadata || (
              <div className="flex w-full flex-col items-start justify-center">
                <div className="line-clamp-1 text-sm font-semibold break-all text-gray-900 dark:text-white">
                  {user?.display_name || user?.handle || t('common.unnamed')}
                </div>
                <div className="line-clamp-1 text-xs break-all text-muted-foreground">
                  {user?.email}
                </div>
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64 rounded-xl border-0 bg-white p-3 shadow-xl dark:bg-gray-900"
          side="right"
          align="end"
          forceMount
        >
          <DropdownMenuLabel className="p-0 pb-3 font-normal">
            <div className="flex flex-col space-y-1">
              <Link
                href="/settings/account"
                className="line-clamp-1 w-fit text-sm font-semibold break-all text-gray-900 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400"
              >
                {user?.display_name || user?.handle || t('common.unnamed')}
              </Link>
              <p className="line-clamp-1 text-xs break-all text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>

          <div className="space-y-1">
            <DashboardMenuItem />
            <RewiseMenuItem />
            <MeetTogetherMenuItem />
          </div>

          <DropdownMenuSeparator className="my-3 bg-gray-200 dark:bg-gray-700" />

          <DropdownMenuGroup className="space-y-1">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300">
                <div className="flex items-center gap-3">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                    <Palette className="h-3 w-3" />
                  </div>
                  <span className="text-foreground">{t('common.theme')}</span>
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  sideOffset={4}
                  className="w-48 rounded-lg border-0 bg-white p-2 shadow-xl dark:bg-gray-900"
                >
                  <ThemeDropdownItems />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300">
                <div className="flex items-center gap-3">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                    <Globe className="h-3 w-3" />
                  </div>
                  <span className="text-foreground">
                    {t('common.language')}
                  </span>
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  sideOffset={4}
                  className="w-48 rounded-lg border-0 bg-white p-2 shadow-xl dark:bg-gray-900"
                >
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
                  <DropdownMenuSeparator className="my-2 bg-gray-200 dark:bg-gray-700" />
                  <SystemLanguageWrapper currentLocale={locale} />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem
              className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
              onClick={() => setOpen(true)}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                  <Settings className="h-3 w-3" />
                </div>
                <span>{t('common.settings')}</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <InviteMembersMenuItem />
          <DropdownMenuSeparator className="my-3 bg-gray-200 dark:bg-gray-700" />
          <LogoutDropdownItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
