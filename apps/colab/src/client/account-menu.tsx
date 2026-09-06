import { LogIn } from '@tuturuuu/icons';
import type { Identity } from '@tuturuuu/multiplayer';
import { SatelliteAccountSwitcherMenu } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
import { SatelliteLanguageItem } from '@tuturuuu/ui/custom/satellite-language-item';
import { SatelliteThemeDropdownItems } from '@tuturuuu/ui/custom/satellite-theme-dropdown-items';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import { SatelliteUserMenuItems } from '@tuturuuu/ui/custom/satellite-user-menu-items';
import { useSidebar } from '@tuturuuu/ui/custom/sidebar-context';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { useContext } from 'react';
import {
  type Locale,
  LocalePreferenceContext,
  useCopy,
  useShellCopy,
} from './i18n';

export function AccountMenu({
  identity,
  loading,
  compact,
  onReport,
  onLogout,
  onLocaleChange,
}: {
  identity: Identity | null;
  loading: boolean;
  compact: boolean;
  onReport: () => void;
  onLogout: () => void;
  onLocaleChange: (locale: Locale | undefined) => void;
}) {
  const c = useCopy();
  const t = useShellCopy();
  const sidebar = useSidebar();
  const preference = useContext(LocalePreferenceContext);
  const signedIn = Boolean(identity?.email);
  const loginUrl = `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  return (
    <SatelliteUserMenu
      name={loading ? c.loadingAccount : (identity?.name ?? c.login)}
      email={identity?.email}
      avatarUrl={identity?.avatarUrl}
      secondaryLabel={
        identity?.email ?? (identity ? c.guestAccount : c.connectAccount)
      }
      hideMetadata={compact}
      online={Boolean(identity)}
      label={c.accountMenu}
      loading={loading}
    >
      {!signedIn && (
        <>
          <DropdownMenuItem asChild>
            <a href={loginUrl}>
              <LogIn className="h-4 w-4" />
              {c.login}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <SatelliteUserMenuItems
        centralUrl="https://tuturuuu.com"
        t={t}
        sidebar={sidebar}
        signedIn={signedIn}
        languageItems={
          <>
            <SatelliteLanguageItem
              label="English"
              selected={preference === 'en'}
              onSelect={() => onLocaleChange('en')}
            />
            <SatelliteLanguageItem
              label="Tiếng Việt"
              selected={preference === 'vi'}
              onSelect={() => onLocaleChange('vi')}
            />
            <DropdownMenuSeparator />
            <SatelliteLanguageItem
              label={t('common.system')}
              selected={!preference}
              system
              onSelect={() => onLocaleChange(undefined)}
            />
          </>
        }
        themeItems={
          <SatelliteThemeDropdownItems t={(key) => t(`common.${key}`)} />
        }
        accountItems={
          signedIn ? (
            <SatelliteAccountSwitcherMenu
              centralUrl="https://tuturuuu.com"
              currentRoute={location.pathname + location.search}
              t={(key) => t(`account_switcher.${key}`)}
              onAccountChanged={() => location.assign(loginUrl)}
            />
          ) : null
        }
        onReport={onReport}
        onLogout={onLogout}
      />
    </SatelliteUserMenu>
  );
}
