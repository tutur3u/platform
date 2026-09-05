import {
  BookOpen,
  FlaskConical,
  Home,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from '@tuturuuu/icons';
import type { Identity } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { type ReactNode, useState } from 'react';
import { useCopy } from './i18n';

/** Same framework-independent shell used by Tuturuuu satellite structure.tsx files. */
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
  const brand = (
    <a
      href="/"
      className="flex min-w-0 items-center gap-2 rounded-lg p-2 font-semibold no-underline"
      aria-label="Colab by Tuturuuu"
    >
      <FlaskConical className="size-5 shrink-0" />
      {!collapsed && <span>Colab</span>}
    </a>
  );
  const links = roomId
    ? ([
        ['mission', c.mission, BookOpen],
        ['team-prompt', c.promptSection, Users],
        ['team-skills', c.skills, BookOpen],
        ['sandbox-desk', c.mockDesk, FlaskConical],
        ['practice-journal', c.runs, BookOpen],
      ] as const)
    : [];
  return (
    <div className="colab-shell">
      <BaseStructure
        isCollapsed={collapsed}
        setIsCollapsed={toggle}
        sidebarLabels={{ open: c.shellExpand, close: c.shellCollapse }}
        hideSizeToggle
        sidebarHeader={brand}
        mobileHeader={
          <span className="flex items-center gap-2 text-sm">
            <FlaskConical className="size-4" />
            Colab
          </span>
        }
        sidebarContent={
          <nav
            aria-label={c.shellNavigation}
            className="flex flex-col gap-1 p-2"
          >
            <Button
              variant={!roomId ? 'secondary' : 'ghost'}
              className={collapsed ? 'w-full px-2' : 'w-full justify-start'}
              title={c.shellHome}
              aria-label={c.shellHome}
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
                className={collapsed ? 'w-full px-2' : 'w-full justify-start'}
                title={c.recent}
                aria-label={c.recent}
                onClick={() => {
                  navigate(recent);
                  closeMobile();
                }}
              >
                <Users className="size-4" />
                {!collapsed && c.recent}
              </Button>
            )}
            {!collapsed && roomId && (
              <p className="mt-5 mb-1 px-3 font-medium text-muted-foreground text-xs">
                {c.shellWorkshop}
              </p>
            )}
            {links.map(([id, label, Icon]) => (
              <Button
                key={id}
                variant="ghost"
                asChild
                className={collapsed ? 'w-full px-2' : 'w-full justify-start'}
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
          <div className="flex w-full flex-col gap-2">
            <Button
              variant="ghost"
              asChild
              className={collapsed ? 'px-2' : 'justify-start'}
            >
              <a
                href="https://tuturuuu.com"
                title={c.shellPlatform}
                aria-label={c.shellPlatform}
              >
                <LogIn className="size-4" />
                {!collapsed && c.shellPlatform}
              </a>
            </Button>
            <Button
              variant="ghost"
              className="hidden w-full justify-start md:flex"
              title={collapsed ? c.shellExpand : c.shellCollapse}
              aria-label={collapsed ? c.shellExpand : c.shellCollapse}
              onClick={() => toggle(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <>
                  <PanelLeftClose className="size-4" />
                  {c.shellCollapse}
                </>
              )}
            </Button>
          </div>
        }
        actions={
          <div className="w-full space-y-3">
            {identity && (
              <div
                className="truncate px-2 text-muted-foreground text-xs"
                title={identity.email ?? identity.name}
              >
                {identity.email ?? identity.name}
              </div>
            )}
            {actions}
          </div>
        }
        userPopover={
          <details className="relative">
            <summary
              className="grid size-8 cursor-pointer list-none place-items-center rounded-full bg-muted font-medium text-xs"
              aria-label={identity?.name ?? c.login}
            >
              {identity?.name.slice(0, 1).toUpperCase() ?? 'C'}
            </summary>
            <div className="fixed bottom-4 left-16 z-50 max-w-64 rounded-xl border bg-background p-4 shadow-lg max-md:top-14 max-md:right-3 max-md:bottom-auto max-md:left-auto">
              {identity && (
                <p className="truncate text-xs">
                  {identity.email ?? identity.name}
                </p>
              )}
              {actions}
            </div>
          </details>
        }
      >
        <div className="colab-content">{children}</div>
      </BaseStructure>
    </div>
  );
}
