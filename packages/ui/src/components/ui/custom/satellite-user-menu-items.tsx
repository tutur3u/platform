'use client';

import {
  AlertTriangle,
  Check,
  ExternalLink,
  Globe,
  LogOut,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  SquareMousePointer,
} from '@tuturuuu/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { ReactNode } from 'react';

export type SidebarBehavior = 'expanded' | 'collapsed' | 'hover' | 'hidden';

/** One menu definition for the Next.js satellite and framework adapters. */
export function SatelliteUserMenuItems({
  centralUrl,
  t,
  sidebar,
  languageItems,
  themeItems,
  accountItems,
  workspaceSelect,
  signedIn,
  onReport,
  onLogout,
}: {
  centralUrl: string;
  t: (
    key:
      | 'common.collapsed'
      | 'common.dashboard'
      | 'common.expand_on_hover'
      | 'common.expanded'
      | 'common.hidden'
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
  workspaceSelect?: ReactNode;
  signedIn: boolean;
  onReport: () => void;
  onLogout: () => void;
}) {
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
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <a
            href={centralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer"
          >
            <ExternalLink className="h-4 w-4 text-dynamic-green" />
            <span>{t('common.dashboard')}</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
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
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            onReport();
          }}
        >
          <AlertTriangle className="h-4 w-4 text-dynamic-yellow" />
          <span>{t('common.report-problem')}</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {signedIn && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>{accountItems}</DropdownMenuGroup>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
        <LogOut className="h-4 w-4 text-dynamic-red" />
        <span>{t('common.logout')}</span>
      </DropdownMenuItem>
    </>
  );
}
