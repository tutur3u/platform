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
  Settings,
  SquareMousePointer,
  User,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { ReportProblemDialog } from '@tuturuuu/ui/report-problem-dialog';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { type ReactNode, useContext, useState } from 'react';
import { SidebarContext } from '../context/sidebar-context';
import { LanguageWrapper } from './language-wrapper';
import { SystemLanguageWrapper } from './system-language-wrapper';
import { ThemeDropdownItems } from './theme-dropdown-items';

interface UserNavClientProps {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
  /** The app name used in the logout redirect URL (e.g., "Rewise", "Tasks") */
  appName?: string;
  /** The URL of the central Tuturuuu web app */
  ttrUrl?: string;
  /** Optional settings dialog component. Receives wsId and user as props. */
  settingsDialog?: ReactNode;
}

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
  appName = 'App',
  ttrUrl,
  settingsDialog,
}: UserNavClientProps) {
  const t = useTranslations();

  const sidebar = useContext(SidebarContext);
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const centralUrl =
    ttrUrl ??
    (process.env.NODE_ENV === 'production'
      ? 'https://tuturuuu.com'
      : `http://localhost:${process.env.CENTRAL_PORT || 7803}`);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.assign(`${centralUrl}/logout?from=${appName}`);
  };

  return (
    <>
      <ReportProblemDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        showTrigger={false}
      />

      {user && settingsDialog && (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          {settingsDialog}
        </Dialog>
      )}

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
              {/* Online indicator */}
              <div
                className={cn(
                  'absolute right-0 bottom-0 z-20 h-3 w-3 rounded-full border-2 border-background',
                  'bg-dynamic-green'
                )}
              />
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
              <span className="line-clamp-1 break-all font-medium text-sm">
                {user?.display_name || user?.handle || t('common.unnamed')}
              </span>
              <p className="line-clamp-1 break-all text-xs opacity-70">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
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
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setReportOpen(true);
              }}
            >
              <AlertTriangle className="h-4 w-4 text-dynamic-yellow" />
              <span>{t('common.report-problem')}</span>
            </DropdownMenuItem>
            {settingsDialog && (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
                <span>{t('common.settings')}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
            <LogOut className="h-4 w-4 text-dynamic-red" />
            <span>{t('common.logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// Re-export the wsId for consumers that need it
// Re-export the wsId for consumers that need it
// Re-export the wsId for consumers that need it
// Re-export the wsId for consumers that need it
export type { UserNavClientProps };
