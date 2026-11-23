'use client';

import { Terminal } from '@tuturuuu/icons/lucide-static';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SatelliteAccountSwitcherMenu } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import { SatelliteUserMenuItems } from '@tuturuuu/ui/custom/satellite-user-menu-items';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@tuturuuu/ui/dropdown-menu';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { getPublicProfilePath } from '@tuturuuu/utils/public-profile-url';
import { useTranslations } from 'next-intl';
import { type ReactNode, type RefObject, useContext } from 'react';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { SidebarContext } from '@/context/sidebar-context';
import { LanguageWrapper } from './(dashboard)/_components/language-wrapper';
import { SystemLanguageWrapper } from './(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownItems } from './(dashboard)/_components/theme-dropdown-items';
import { fetchWorkspaces } from './(dashboard)/[wsId]/workspace-list-actions';
import UserPresenceIndicator from './user-presence-indicator';

const REPORT_PROBLEM_OPEN_INTENT = 'tuturuuu:report-problem-open-intent';

/** The Web account menu: the shared account menu with Web's adapters. */
export function UserNavMenu({
  user,
  userName,
  locale,
  hideMetadata,
  secondaryLabel,
  wsId,
  triggerRef,
  appItems,
  onOpenSettings,
}: {
  user: WorkspaceUser | null;
  userName: string;
  locale: string | undefined;
  hideMetadata: boolean;
  secondaryLabel: string;
  wsId: string | undefined;
  triggerRef: RefObject<HTMLButtonElement | null>;
  appItems?: ReactNode;
  onOpenSettings: (tab?: string) => void;
}) {
  const t = useTranslations();
  const accountT = useTranslations('account_switcher');
  const sidebar = useContext(SidebarContext);
  const { logout } = useAccountSwitcher();
  const { modKey } = usePlatform();
  const profilePath = user ? getPublicProfilePath(user.handle) : null;
  const name = userName || t('common.unnamed');

  return (
    <SatelliteUserMenu
      name={name}
      email={user?.email}
      avatarUrl={user?.avatar_url}
      secondaryLabel={secondaryLabel}
      hideMetadata={hideMetadata}
      triggerRef={triggerRef}
      online={Boolean(user)}
      presence={
        user ? (
          <UserPresenceIndicator className="-right-1 -bottom-1 h-3 w-3 border-2" />
        ) : undefined
      }
      onNameClick={user ? () => onOpenSettings('profile') : undefined}
    >
      <SatelliteUserMenuItems
        t={t}
        sidebar={sidebar}
        signedIn={Boolean(user)}
        workspaceSelect={
          wsId ? (
            <WorkspaceSelect
              disableCreateNewWorkspace
              fallbackLogoUrl={TUTURUUU_LOCAL_LOGO_URL}
              fetchWorkspaces={fetchWorkspaces}
              showTierBadges={false}
              standalone
              triggerClassName="h-9 w-full border-border/70 bg-muted/30 px-2 shadow-none hover:bg-muted/60"
              wsId={wsId}
            />
          ) : undefined
        }
        publicProfile={
          profilePath
            ? { href: profilePath, label: t('common.public_profile') }
            : undefined
        }
        settings={
          user
            ? {
                label: t('common.settings'),
                onOpen: () => onOpenSettings(),
                shortcut: `${modKey},`,
              }
            : undefined
        }
        appItems={appItems}
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
            centralUrl=""
            workspaceId={wsId}
            t={accountT}
            onManageAccounts={() => onOpenSettings('accounts')}
            onAccountChanged={(response) => {
              const target = response.redirectTo?.trim();
              if (target) window.location.assign(target);
              else window.location.reload();
            }}
          />
        }
        onReport={() =>
          window.dispatchEvent(new Event(REPORT_PROBLEM_OPEN_INTENT))
        }
        onLogout={logout}
      />
    </SatelliteUserMenu>
  );
}

/** Opens the global command launcher; listed after Settings in a workspace. */
export function CommandPaletteMenuItem({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('common');
  const { modKey } = usePlatform();
  return (
    <DropdownMenuItem className="cursor-pointer" onSelect={onOpen}>
      <Terminal className="h-4 w-4 text-dynamic-blue" />
      <span>{t('command_palette')}</span>
      <DropdownMenuShortcut>{modKey}K</DropdownMenuShortcut>
    </DropdownMenuItem>
  );
}
