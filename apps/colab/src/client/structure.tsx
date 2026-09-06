import {
  BookOpen,
  Building2,
  ChevronDown,
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
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { type ReactNode, useState } from 'react';
import logo from './assets/tuturuuu.png';
import { useCopy } from './i18n';
import { ThemeToggle } from './theme-toggle';

/** Shared satellite layout, with framework-independent Colab navigation. */
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
  const [collapsed, setCollapsed] = useState(
    () =>
      window.innerWidth < 768 ||
      localStorage.getItem('colab-sidebar-collapsed') === 'true'
  );
  const toggle = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem('colab-sidebar-collapsed', String(value));
  };
  const recent = localStorage.getItem('colab-recent-room');
  const closeMobile = () => {
    if (window.innerWidth < 768) toggle(true);
  };
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
  const links = roomId
    ? ([
        ['mission', c.mission, BookOpen],
        ['team-prompt', c.promptSection, Users],
        ['team-skills', c.skills, FileText],
        ['sandbox-desk', c.mockDesk, Layers],
        ['practice-journal', c.runs, BookOpen],
      ] as const)
    : ([['explore', c.practiceGuide, BookOpen]] as const);
  const brand = (
    <div className="flex w-full items-center gap-3">
      <a
        href="https://tuturuuu.com"
        aria-label={c.shellPlatform}
        className="shrink-0"
      >
        <img src={logo} alt="Tuturuuu" width={32} height={32} />
      </a>
      {!collapsed && (
        <>
          <span className="h-5 border-l" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="justify-start px-1 font-semibold text-base"
                aria-label={c.appMenu}
              >
                Colab <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{c.appMenu}</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href="https://tuturuuu.com">
                  <Building2 className="size-4" />
                  {c.shellPlatform}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('')}>
                <FlaskConical className="size-4" />
                Colab
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
  return (
    <div className="colab-shell">
      <BaseStructure
        isCollapsed={collapsed}
        setIsCollapsed={toggle}
        sidebarLabels={{ open: c.shellExpand, close: c.shellCollapse }}
        sidebarHeader={brand}
        sidebarHeaderHeight="3.5rem"
        mobileHeader={
          <>
            <img src={logo} alt="Tuturuuu" width={24} height={24} />
            <span>Colab</span>
            <ThemeToggle />
          </>
        }
        header={
          <div className="colab-toolbar">
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? c.shellExpand : c.shellCollapse}
              onClick={() => toggle(!collapsed)}
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
          <nav
            aria-label={c.shellNavigation}
            className="flex flex-col gap-1 p-2"
          >
            <Button
              variant={!roomId ? 'secondary' : 'ghost'}
              className={`h-10 w-full ${collapsed ? 'px-2' : 'justify-start'}`}
              aria-label={c.shellHome}
              title={c.shellHome}
              onClick={() => {
                navigate('');
                closeMobile();
              }}
            >
              <Home className="size-4" />
              {!collapsed && c.shellHome}
            </Button>
            {recent && !roomId && (
              <Button
                variant="ghost"
                className={`h-10 w-full ${collapsed ? 'px-2' : 'justify-start'}`}
                aria-label={c.recent}
                title={c.recent}
                onClick={() => {
                  navigate(recent);
                  closeMobile();
                }}
              >
                <Users className="size-4" />
                {!collapsed && c.shellWorkshop}
              </Button>
            )}
            <div className="my-1 border-t" />
            {links.map(([id, label, Icon]) => (
              <Button
                key={id}
                variant="ghost"
                asChild
                className={`h-10 w-full ${collapsed ? 'px-2' : 'justify-start'}`}
              >
                <a
                  href={`#${id}`}
                  title={label}
                  aria-label={label}
                  onClick={closeMobile}
                >
                  <Icon className="size-4" />
                  {!collapsed && label}
                </a>
              </Button>
            ))}
          </nav>
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
      </BaseStructure>
    </div>
  );
}
