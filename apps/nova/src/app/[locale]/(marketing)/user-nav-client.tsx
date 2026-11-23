'use client';

import { Home, Medal, Trophy, User } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SatelliteAccountSwitcherMenu } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import { SatelliteUserMenuItems } from '@tuturuuu/ui/custom/satellite-user-menu-items';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { createLogoutConfirmationUrl } from '@tuturuuu/utils/logout-target';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { TTR_URL } from '@/constants/common';
import { LanguageWrapper } from '../(dashboard)/_components/language-wrapper';
import { SystemLanguageWrapper } from '../(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownItems } from '../(dashboard)/_components/theme-dropdown-items';
import UserSettingsDialog from './settings-dialog';
import UserPresenceIndicator from './user-presence-indicator';

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
  const accountT = useTranslations('account_switcher');
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const name = user?.display_name || user?.handle || t('common.unnamed');

  const logout = () => {
    router.push(
      createLogoutConfirmationUrl({
        centralUrl: TTR_URL,
        appOrigin: window.location.origin,
        locale: document.documentElement.lang,
      })
    );
  };

  return (
    <>
      {user && (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <UserSettingsDialog user={user} />
        </Dialog>
      )}
      <SatelliteUserMenu
        name={name}
        email={user?.email}
        avatarUrl={user?.avatar_url}
        hideMetadata={hideMetadata}
        online={Boolean(user)}
        presence={
          user ? (
            <UserPresenceIndicator className="-right-1 -bottom-1 h-3 w-3 border-2" />
          ) : undefined
        }
      >
        <SatelliteUserMenuItems
          t={t}
          signedIn={Boolean(user)}
          settings={
            user
              ? {
                  label: t('common.settings'),
                  onOpen: () => setSettingsOpen(true),
                }
              : undefined
          }
          appItems={
            <>
              <NovaLink href="/home" icon={<Home className="h-4 w-4" />}>
                {t('common.home')}
              </NovaLink>
              {user && (
                <NovaLink
                  href={`/profile/${user.id.replace(/-/g, '')}`}
                  icon={<User className="h-4 w-4" />}
                >
                  {t('common.profile')}
                </NovaLink>
              )}
              <NovaLink
                href="/challenges"
                icon={<Trophy className="h-4 w-4" />}
              >
                {t('nova.challenges')}
              </NovaLink>
              <NovaLink
                href="/leaderboard"
                icon={<Medal className="h-4 w-4" />}
              >
                {t('nova.leaderboard')}
              </NovaLink>
            </>
          }
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
            <SatelliteAccountSwitcherMenu centralUrl={TTR_URL} t={accountT} />
          }
          onLogout={logout}
        />
      </SatelliteUserMenu>
    </>
  );
}

function NovaLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem asChild className="cursor-pointer">
      <Link href={href}>
        {icon}
        <span>{children}</span>
      </Link>
    </DropdownMenuItem>
  );
}
