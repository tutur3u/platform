'use client';

import { Globe, LogOut, Palette, Settings } from '@tuturuuu/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { ReactNode } from 'react';
import { AccountHubActionItems } from './account-hub-ui';
import { PublicProfileMenuItem } from './public-profile-menu-item';
import type { SidebarBehavior } from './sidebar-behavior';
import { SatelliteSidebarBehaviorMenu } from './satellite-sidebar-behavior-menu';

export { PublicProfileMenuItem } from './public-profile-menu-item';

export type { SidebarBehavior } from './sidebar-behavior';

/**
 * The account menu body every app renders, in one order: workspace, profile
 * and settings (plus app actions), preferences, Upgrade/Feedback/Notifications/
 * Discord, accounts, Logout.
 */
export function SatelliteUserMenuItems({
  t,
  sidebar,
  languageItems,
  themeItems,
  accountItems,
  appItems,
  workspaceSelect,
  signedIn,
  publicProfile,
  settings,
  onReport,
  onLogout,
}: {
  t: (
    key:
      | 'common.collapsed'
      | 'common.expand_on_hover'
      | 'common.expanded'
      | 'common.minimal'
      | 'common.language'
      | 'common.logout'
      | 'common.report-problem'
      | 'common.sidebar'
      | 'common.theme'
  ) => string;
  sidebar?: {
    behavior: SidebarBehavior;
    handleBehaviorChange: (value: SidebarBehavior) => void;
  } | null;
  languageItems: ReactNode;
  themeItems: ReactNode;
  accountItems: ReactNode;
  /** App-specific actions listed after Settings, such as a command palette. */
  appItems?: ReactNode;
  workspaceSelect?: ReactNode;
  signedIn: boolean;
  publicProfile?: { href: string; label: string };
  /** Opens the in-app settings dialog (shared `?settingsTab=` contract). */
  settings?: { label: string; onOpen: () => void; shortcut?: string };
  /** Feedback where the sidebar's account hub does not publish one. */
  onReport?: () => void;
  onLogout: () => void;
}) {
  const showProfile = signedIn && publicProfile;
  const showSettings = signedIn && settings;
  return (
    <>
      {workspaceSelect ? (
        <>
          <div className="w-full p-1 [&_[data-slot=popover-trigger]]:h-9">
            {workspaceSelect}
          </div>
          <DropdownMenuSeparator />
        </>
      ) : null}
      {showProfile || showSettings || appItems ? (
        <>
          <DropdownMenuGroup>
            {showProfile && <PublicProfileMenuItem {...publicProfile} />}
            {showSettings && (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(event) => {
                  event.preventDefault();
                  settings.onOpen();
                }}
              >
                <Settings className="h-4 w-4 text-dynamic-blue" />
                <span>{settings.label}</span>
                {settings.shortcut && (
                  <DropdownMenuShortcut>
                    {settings.shortcut}
                  </DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            )}
            {appItems}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuGroup>
        {sidebar && <SatelliteSidebarBehaviorMenu sidebar={sidebar} t={t} />}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="h-4 w-4 text-dynamic-indigo" />
            <span>{t('common.language')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent sideOffset={4}>
              {languageItems}
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
              {themeItems}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <AccountHubActionItems
        fallbackFeedback={
          onReport
            ? { label: t('common.report-problem'), onOpen: onReport }
            : undefined
        }
      />
      {signedIn && accountItems ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>{accountItems}</DropdownMenuGroup>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
        <LogOut className="h-4 w-4 text-dynamic-red" />
        <span>{t('common.logout')}</span>
      </DropdownMenuItem>
    </>
  );
}
