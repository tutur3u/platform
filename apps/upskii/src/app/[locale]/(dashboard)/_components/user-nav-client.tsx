'use client';

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { Globe, Palette, Settings, User } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LanguageWrapper } from '@/app/[locale]/(dashboard)/_components/language-wrapper';
import { LogoutDropdownItem } from '@/app/[locale]/(dashboard)/_components/logout-dropdown-item';
import { SystemLanguageWrapper } from '@/app/[locale]/(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownItems } from '@/app/[locale]/(dashboard)/_components/theme-dropdown-items';
import UserPresenceIndicator from '@/components/user-presence-indicator';
import InviteMembersMenuItem from '../../../../components/invite-members-menu-item';
import UserSettingsDialog from '../../../../components/settings-dialog';

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
}: {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
}) {
  const isMobile = useIsMobile();
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      {user && (
        <Dialog open={open} onOpenChange={setOpen}>
          <UserSettingsDialog user={user} />
        </Dialog>
      )}

      <DropdownMenu modal={isMobile}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex h-10 w-full gap-2 rounded-md p-1 text-start transition',
              hideMetadata
                ? 'items-center justify-center'
                : 'items-center justify-start hover:bg-foreground/5'
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
              <UserPresenceIndicator className="-right-1 -bottom-1 h-3 w-3 border-2" />
            </Avatar>
            {hideMetadata || (
              <div className="flex w-full flex-col items-start justify-center">
                <div className="line-clamp-1 text-sm font-semibold break-all">
                  {user?.display_name || user?.handle || t('common.unnamed')}
                </div>
                <div className="line-clamp-1 text-xs break-all opacity-70">
                  {user?.email}
                </div>
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[90vw] md:w-56"
          side={isMobile ? 'top' : 'right'}
          align={isMobile ? 'center' : 'end'}
          forceMount
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <Link
                href="/settings/account"
                className="line-clamp-1 w-fit text-sm font-medium break-all hover:underline"
              >
                {user?.display_name || user?.handle || t('common.unnamed')}
              </Link>
              <p className="line-clamp-1 text-xs break-all text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            {isMobile ? (
              <>
                <DropdownMenuLabel>{t('common.theme')}</DropdownMenuLabel>
                <ThemeDropdownItems />
                <DropdownMenuSeparator />
              </>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{t('common.theme')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent sideOffset={4}>
                    <ThemeDropdownItems />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            {isMobile ? (
              <>
                <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
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
                <SystemLanguageWrapper currentLocale={locale} />
                <DropdownMenuSeparator />
              </>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">
                    {t('common.language')}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    sideOffset={4}
                    className="w-[90vw] md:w-auto"
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
                    <DropdownMenuSeparator />
                    <SystemLanguageWrapper currentLocale={locale} />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
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
