import {
  Bell,
  BookOpen,
  Building2,
  FileText,
  FlaskConical,
  Home,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import type { Identity } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SatelliteContent } from '@tuturuuu/ui/custom/satellite-content';
import { SatelliteFooterActions } from '@tuturuuu/ui/custom/satellite-footer-actions';
import { SatelliteShell } from '@tuturuuu/ui/custom/satellite-shell';
import { getFilteredLinks } from '@tuturuuu/ui/custom/satellite-shell-utils';
import { useSatelliteShell } from '@tuturuuu/ui/custom/use-satellite-shell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { type ReactNode, useMemo, useState } from 'react';
import { AccountMenu } from './account-menu';
import logo from './assets/tuturuuu.png';
import { type Locale, useCopy } from './i18n';
import { ShellNavigation } from './shell-navigation';
import { ThemeToggle } from './theme-toggle';

const persistCollapsed = (collapsed: boolean) =>
  localStorage.setItem('colab-sidebar-collapsed', String(collapsed));

/** Vite adapter for the same shell used by Tasks, Calendar and other satellites. */
export function Structure({
  children,
  actions,
  loading,
  onLogout,
  onLocaleChange,
  identity,
  roomId,
  navigate,
}: {
  children: ReactNode;
  actions: ReactNode;
  loading: boolean;
  onLogout: () => void;
  onLocaleChange: (locale: Locale) => void;
  identity: Identity | null;
  roomId: string;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const [appsOpen, setAppsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const recent = localStorage.getItem('colab-recent-room');
  const links = useMemo<(NavLink | null)[]>(
    () => [
      {
        title: c.shellHome,
        href: '/',
        icon: <Home className="size-4" />,
        onClick: () => navigate(''),
      },
      ...(recent && !roomId
        ? [
            {
              title: c.recent,
              icon: <Users className="size-4" />,
              onClick: () => navigate(recent),
            },
          ]
        : []),
      null,
      ...(roomId
        ? [
            {
              title: c.mission,
              href: '#mission',
              icon: <BookOpen className="size-4" />,
            },
            {
              title: c.promptSection,
              href: '#team-prompt',
              icon: <Users className="size-4" />,
            },
            {
              title: c.skills,
              href: '#team-skills',
              icon: <FileText className="size-4" />,
            },
            {
              title: c.mockDesk,
              href: '#sandbox-desk',
              icon: <Layers className="size-4" />,
            },
            {
              title: c.runs,
              href: '#practice-journal',
              icon: <BookOpen className="size-4" />,
            },
          ]
        : [
            {
              title: c.practiceGuide,
              href: '#explore',
              icon: <BookOpen className="size-4" />,
            },
          ]),
    ],
    [c, roomId, recent, navigate]
  );
  const {
    isCollapsed: collapsed,
    setIsCollapsed,
    handleToggle,
    navState,
    setNavState,
    backButton,
  } = useSatelliteShell({
    pathname: roomId ? `/?room=${roomId}` : '/',
    links,
    defaultCollapsed:
      window.innerWidth < 768 ||
      localStorage.getItem('colab-sidebar-collapsed') === 'true',
    persistCollapsed,
    backLabel: c.back,
  });
  const account = (compact: boolean) => (
    <AccountMenu
      identity={identity}
      loading={loading}
      compact={compact}
      collapsed={collapsed}
      onCollapse={handleToggle}
      onSettings={() => setSettingsOpen(true)}
      onLogout={onLogout}
      onLocaleChange={onLocaleChange}
    />
  );
  const notifications = identity?.email ? (
    <Button variant="ghost" size="icon" asChild>
      <a
        href="https://tuturuuu.com/personal/notifications"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={c.notifications}
        title={c.notifications}
      >
        <Bell className="size-4" />
      </a>
    </Button>
  ) : undefined;
  return (
    <div className="colab-shell">
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.feedbackAction}</DialogTitle>
            <DialogDescription>{c.feedbackHelp}</DialogDescription>
          </DialogHeader>
          <Button asChild>
            <a
              href="https://github.com/tutur3u/platform/issues/new/choose"
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.reportIssue}
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://discord.gg/kNDxVnnUZ4"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.settings}</DialogTitle>
            <DialogDescription>{c.preferencesHelp}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <span>{c.language}</span>
            {actions}
          </div>
          <div className="flex items-center justify-between">
            <span>{c.appearance}</span>
            <ThemeToggle />
          </div>
          <Button variant="outline" onClick={handleToggle}>
            {collapsed ? c.shellExpand : c.shellCollapse}
          </Button>
          {identity?.email && (
            <Button variant="outline" asChild>
              <a
                href="https://tuturuuu.com/personal?settingsDialog=open&settingsTab=profile"
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.manageProfile}
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={appsOpen} onOpenChange={setAppsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.appMenu}</DialogTitle>
            <DialogDescription>{c.shellPlatform}</DialogDescription>
          </DialogHeader>
          <Button variant="ghost" asChild>
            <a href="https://tuturuuu.com">
              <Building2 className="size-4" />
              {c.shellPlatform}
            </a>
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              navigate('');
              setAppsOpen(false);
            }}
          >
            <FlaskConical className="size-4" />
            Colab
          </Button>
        </DialogContent>
      </Dialog>
      <SatelliteShell
        isCollapsed={collapsed}
        setIsCollapsed={handleToggle}
        sidebarLabels={{ open: c.shellExpand, close: c.shellCollapse }}
        homeLabel={c.shellPlatform}
        collapsedLogo={
          <img src={logo} alt="" width={28} height={28} className="h-7 w-7" />
        }
        brand={{
          appName: 'Colab',
          appHref: '/',
          centralHref: 'https://tuturuuu.com',
          launcherLabel: c.appMenu,
          logo: (
            <img src={logo} alt="" width={32} height={32} className="size-8" />
          ),
          onAppClick: () => setAppsOpen(true),
        }}
        mobileBrandActions={<ThemeToggle />}
        header={
          <div className="colab-toolbar">
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? c.shellExpand : c.shellCollapse}
              onClick={handleToggle}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
            <span className="h-4 border-l" />
            <FlaskConical className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">
              {roomId ? c.shellWorkshop : c.lobbyTitle}
            </span>
            <span className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
              <ShieldCheck className="size-3.5" />
              {c.safeWorkspace}
            </span>
            <ThemeToggle />
          </div>
        }
        sidebarContent={
          <SatelliteContent
            Navigation={ShellNavigation}
            wsId={roomId}
            backButton={backButton}
            filteredCurrentLinks={getFilteredLinks(navState.currentLinks)}
            currentTitle={navState.titleHistory.at(-1)}
            isCollapsed={collapsed}
            navState={navState}
            setNavState={setNavState}
            setIsCollapsed={setIsCollapsed}
            workspaceSelectVisible={false}
          />
        }
        sidebarUtility={
          <Button
            variant="ghost"
            aria-label={c.settings}
            className={`h-9 rounded-lg ${collapsed ? 'w-9 px-0' : 'w-full justify-start px-3'}`}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4 shrink-0" />
            {!collapsed && c.settings}
          </Button>
        }
        feedbackButton={
          <SatelliteFooterActions
            wsId=""
            isCollapsed={collapsed}
            showUpgrade={false}
            labels={{ upgrade: '', feedback: c.feedbackAction }}
            discordHref="https://discord.gg/kNDxVnnUZ4"
            onFeedback={() => setFeedbackOpen(true)}
          />
        }
        notificationPopover={notifications}
        actions={
          <div className="flex w-full min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1">{account(false)}</div>
            {notifications}
          </div>
        }
        userPopover={account(true)}
        hideSizeToggle
      >
        <div className="colab-content">{children}</div>
      </SatelliteShell>
    </div>
  );
}
