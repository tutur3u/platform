import {
  ExternalLink,
  Globe,
  LogIn,
  LogOut,
  Palette,
  PanelLeft,
  Settings,
  UserRound,
  Users,
} from '@tuturuuu/icons';
import type { Identity } from '@tuturuuu/multiplayer';
import { SatelliteUserMenu } from '@tuturuuu/ui/custom/satellite-user-menu';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import { useContext } from 'react';
import { type Locale, LocaleContext, useCopy } from './i18n';

export function AccountMenu({
  identity,
  loading,
  compact,
  collapsed,
  onCollapse,
  onSettings,
  onLogout,
  onLocaleChange,
}: {
  identity: Identity | null;
  loading: boolean;
  compact: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onLocaleChange: (locale: Locale) => void;
}) {
  const c = useCopy();
  const locale = useContext(LocaleContext);
  const { theme, setTheme } = useTheme();
  const signedIn = Boolean(identity?.email);
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
          <p className="px-2 py-1 text-muted-foreground text-xs">
            {c.connectAccountHelp}
          </p>
          <DropdownMenuItem asChild>
            <a
              href={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
            >
              <LogIn className="size-4" />
              {c.login}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuGroup>
        {signedIn && (
          <DropdownMenuItem asChild>
            <a
              href="https://tuturuuu.com/personal?settingsDialog=open&settingsTab=profile"
              target="_blank"
              rel="noopener noreferrer"
            >
              <UserRound className="size-4 text-dynamic-green" />
              {c.manageProfile}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onSettings}>
          <Settings className="size-4" />
          {c.settings}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://tuturuuu.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4 text-dynamic-green" />
            {c.shellPlatform}
          </a>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Globe className="size-4 text-dynamic-indigo" />
          {c.language}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value) => onLocaleChange(value as Locale)}
            >
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="vi">
                Tiếng Việt
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Palette className="size-4 text-dynamic-cyan" />
          {c.appearance}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                {c.themeLight}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                {c.themeDark}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                {c.themeSystem}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      <DropdownMenuItem onSelect={onCollapse}>
        <PanelLeft className="size-4 text-dynamic-purple" />
        {collapsed ? c.shellExpand : c.shellCollapse}
      </DropdownMenuItem>
      {signedIn && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href="https://tuturuuu.com/add-account"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Users className="size-4" />
              {c.manageAccounts}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
            >
              <UserRound className="size-4" />
              {c.refreshAccount}
            </a>
          </DropdownMenuItem>
        </>
      )}
      {identity && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogout}>
            <LogOut className="size-4 text-dynamic-red" />
            {c.logout}
          </DropdownMenuItem>
        </>
      )}
    </SatelliteUserMenu>
  );
}
