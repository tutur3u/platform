import {
  BookOpen,
  Building2,
  ChevronsUpDown,
  FileText,
  FlaskConical,
  Home,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import type { Identity } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SatelliteContent } from '@tuturuuu/ui/custom/satellite-content';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { type ReactNode, useMemo, useState } from 'react';
import logo from './assets/tuturuuu.png';
import { useCopy } from './i18n';
import { ShellNavigation } from './shell-navigation';
import { ThemeToggle } from './theme-toggle';

const persistCollapsed = (collapsed: boolean) =>
  localStorage.setItem('colab-sidebar-collapsed', String(collapsed));

/** Vite adapter for the same shell used by Tasks, Calendar and other satellites. */
export function Structure({
  children,
  actions,
  identity,
  roomId,
  navigate,
}: {
  children: ReactNode;
  actions: ReactNode;
  identity: Identity | null;
  roomId: string;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const [appsOpen, setAppsOpen] = useState(false);
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={c.accountMenu}
          className={`h-auto min-h-11 ${compact ? 'px-2' : 'w-full justify-start gap-3 px-2'}`}
        >
          <span className="relative grid size-8 shrink-0 place-items-center rounded-lg border bg-muted font-semibold text-sm">
            {identity?.name.slice(0, 1).toUpperCase() ?? (
              <Users className="size-4" />
            )}
          </span>
          {!compact && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-medium text-sm">
                {identity?.name ?? c.login}
              </span>
              <span className="block truncate font-normal text-muted-foreground text-xs">
                {identity?.email ?? c.yourWorkspace}
              </span>
            </span>
          )}
          {!compact && (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel>{c.accountMenu}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-2">{actions}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <div className="colab-shell">
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
            asChild
            className={`h-10 w-full ${collapsed ? 'px-2' : 'justify-start'}`}
          >
            <a
              href="https://tuturuuu.com"
              aria-label={c.shellPlatform}
              title={c.shellPlatform}
            >
              <Building2 className="size-4" />
              {!collapsed && c.shellPlatform}
            </a>
          </Button>
        }
        actions={account(false)}
        userPopover={account(true)}
        hideSizeToggle
      >
        <div className="colab-content">{children}</div>
      </SatelliteShell>
    </div>
  );
}
