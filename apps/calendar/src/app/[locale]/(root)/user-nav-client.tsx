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
              'flex h-10 w-full gap-2 rounded-md p-1 text-start transition',
              hideMetadata
                ? 'items-center justify-center'
                : 'hover:bg-foreground/5 items-center justify-start'
            )}
          >
            <Avatar className="relative cursor-pointer overflow-visible font-semibold">
              <AvatarImage
                src={user?.avatar_url ?? undefined}
                className="overflow-clip rounded-lg"
              />
              <AvatarFallback className="rounded-lg font-semibold">
                {user?.display_name ? (
                  getInitials(user.display_name)
                ) : (
                  <User className="h-5 w-5" />
                )}
              </AvatarFallback>
              <UserPresenceIndicator className="-bottom-1 -right-1 h-3 w-3 border-2" />
            </Avatar>
            {hideMetadata || (
              <div className="flex w-full flex-col items-start justify-center">
                <div className="line-clamp-1 break-all text-sm font-semibold">
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
                className="line-clamp-1 w-fit break-all text-sm font-medium hover:underline"
              >
                {user?.display_name || user?.handle || t('common.unnamed')}
              </Link>
              <p className="text-muted-foreground line-clamp-1 break-all text-xs">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DashboardMenuItem />
          <RewiseMenuItem />
          <MeetTogetherMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="text-muted-foreground h-4 w-4" />
                <span className="text-foreground">{t('common.theme')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent sideOffset={4}>
                  <ThemeDropdownItems />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe className="text-muted-foreground h-4 w-4" />
                <span className="text-foreground">{t('common.language')}</span>
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
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => setOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>{t('common.settings')}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <InviteMembersMenuItem />
          <DropdownMenuSeparator />
          <LogoutDropdownItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
