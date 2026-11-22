/// <reference types="vite/client" />
import {
  Bell,
  Calendar,
  ChartColumn,
  Clock,
  ListTodo,
  Settings,
  Users,
} from '@tuturuuu/icons';
import { SatelliteContent } from '@tuturuuu/ui/custom/satellite-content';
import { WorkspaceSelectVisibilityToggle } from '@tuturuuu/ui/custom/satellite-brand';
import { SatelliteFooterActions } from '@tuturuuu/ui/custom/satellite-footer-actions';
import { SatelliteShell } from '@tuturuuu/ui/custom/satellite-shell';
import {
  SidebarNavigation,
  SidebarNavigationItemContent,
  satelliteNavigationItemClass,
} from '@tuturuuu/ui/custom/satellite-navigation';
import { useSatelliteShell } from '@tuturuuu/ui/custom/use-satellite-shell';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import {
  useOpenWorkspaceSelectWhenRevealed,
  useWorkspaceSelectSection,
} from '@tuturuuu/ui/custom/workspace-select-reveal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { type ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceSelectTrigger } from '../../src/components/ui/custom/workspace-select-trigger';
import './style.css';

/**
 * Synthetic mount of the real shared satellite chrome (Structure,
 * SatelliteShell, SatelliteContent, useSatelliteShell hover handlers and the
 * footer actions) in hover mode, or in minimal mode with `?behavior=minimal`.
 * Routing, i18n, auth and network are replaced by static fixtures so the page
 * needs no server and renders deterministically.
 */
const behavior =
  new URLSearchParams(window.location.search).get('behavior') === 'minimal'
    ? 'minimal'
    : 'hover';
const pathname = '/ws/calendar';

const links: NavLink[] = [
  {
    title: 'Calendar',
    href: '/ws/calendar',
    icon: <Calendar className="h-4 w-4" />,
  },
  { title: 'Tasks', href: '/ws/tasks', icon: <ListTodo className="h-4 w-4" /> },
  {
    title: 'Time tracker',
    href: '/ws/time',
    icon: <Clock className="h-4 w-4" />,
  },
  { title: 'People', href: '/ws/people', icon: <Users className="h-4 w-4" /> },
  {
    title: 'Workspace analytics',
    href: '/ws/analytics',
    icon: <ChartColumn className="h-4 w-4" />,
  },
];

function SyntheticLink({
  link,
  isCollapsed,
}: {
  link: NavLink;
  isCollapsed: boolean;
}) {
  const isActive = link.href === pathname;
  const anchor = (
    <a
      aria-label={isCollapsed ? link.title : undefined}
      className={satelliteNavigationItemClass({ isCollapsed, isActive })}
      href={link.href}
    >
      <SidebarNavigationItemContent
        icon={link.icon}
        isActive={isActive}
        isCollapsed={isCollapsed}
        title={link.title}
      />
    </a>
  );
  if (!isCollapsed) return anchor;
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{anchor}</TooltipTrigger>
      <TooltipContent side="right">{link.title}</TooltipContent>
    </Tooltip>
  );
}

function Navigation({
  isCollapsed,
  links: items,
}: {
  isCollapsed: boolean;
  links: (NavLink | null)[];
}) {
  return (
    <SidebarNavigation
      isCollapsed={isCollapsed}
      links={items}
      renderLink={(link) => (
        <SyntheticLink isCollapsed={isCollapsed} link={link} />
      )}
    />
  );
}

function CalendarSidebarFixture() {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="calendar-sidebar-content"
    >
      <div className="grid grid-cols-7 gap-0.5 p-2">
        {Array.from({ length: 35 }, (_, i) => (
          <div
            className="flex aspect-square items-center justify-center rounded-md text-xs"
            key={i}
          >
            {(i % 31) + 1}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {['Personal', 'Work', 'Holidays'].map((name) => (
          <div
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm"
            key={name}
          >
            <span className="size-3 rounded-sm bg-dynamic-blue" />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

const Avatar = () => (
  <div
    className="size-8 rounded-full bg-dynamic-purple/30"
    data-testid="avatar"
  />
);

function CalendarGrid(): ReactNode {
  return (
    <div
      className="grid h-full min-h-0 flex-1 grid-cols-7 grid-rows-[repeat(24,minmax(0,1fr))] gap-px bg-border"
      data-testid="calendar-grid"
    >
      {Array.from({ length: 7 * 24 }, (_, i) => (
        <div className="bg-background" key={i} />
      ))}
    </div>
  );
}

function WorkspacePickerFixture({ isCollapsed }: { isCollapsed: boolean }) {
  const [open, setOpen] = useState(false);
  useOpenWorkspaceSelectWhenRevealed(true, setOpen);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <WorkspaceSelectTrigger
          appearance="switch"
          compact={isCollapsed}
          invitationCount={1}
          labels={{
            invitations: 'pending invitation',
            loading: 'Loading',
            select: 'Select workspace',
            switch: 'Switch workspace',
          }}
          workspace={{ name: 'Calendar workspace' }}
        />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Select workspace</DialogTitle>
        <DialogDescription>Choose a workspace.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

function Harness() {
  const [, setNoop] = useState(0);
  const shell = useSatelliteShell({
    pathname,
    links,
    behavior,
    handleBehaviorChange: () => setNoop((n) => n + 1),
    backLabel: 'Back',
  });
  const workspace = useWorkspaceSelectSection(shell.isCollapsed);
  const logo = <div className="size-8 rounded-lg bg-foreground" />;
  return (
    <SatelliteShell
      actions={
        <div className="flex w-full items-center gap-2">
          <Avatar />
          <span className="text-sm">Synthetic user</span>
        </div>
      }
      brand={{
        actions: (
          <WorkspaceSelectVisibilityToggle
            controls={workspace.id}
            hideLabel="Hide workspace selector"
            onToggle={() => workspace.toggle(shell.expandSidebar)}
            showLabel="Show workspace selector"
            visible={workspace.visible}
          />
        ),
        appName: 'Calendar',
        appHref: '/ws',
        centralHref: '/',
        logo,
        onAppClick: () => undefined,
      }}
      collapsedLogo={logo}
      contentFullBleed
      feedbackButton={
        <SatelliteFooterActions
          isCollapsed={shell.isCollapsed}
          labels={{ upgrade: 'Upgrade', feedback: 'Feedback' }}
          onFeedback={() => undefined}
          showUpgrade
          wsId="ws"
        />
      }
      header={null}
      hideSizeToggle
      homeLabel="Home"
      isCollapsed={shell.isCollapsed}
      mobileSidebarOpen={shell.mobileSidebarOpen}
      notificationPopover={<Bell className="size-4" />}
      onMouseEnter={shell.onMouseEnter}
      onMouseLeave={shell.onMouseLeave}
      overlayOnExpand
      sidebarLabels={{ open: 'Open sidebar', close: 'Close sidebar' }}
      sidebarMinimal={behavior === 'minimal'}
      setIsCollapsed={shell.handleToggle}
      sidebarContent={
        <SatelliteContent
          Navigation={Navigation}
          backButton={shell.backButton}
          extraContent={shell.isCollapsed ? null : <CalendarSidebarFixture />}
          filteredCurrentLinks={shell.navState.currentLinks}
          isCollapsed={shell.isCollapsed}
          navState={shell.navState}
          setIsCollapsed={shell.setIsCollapsed}
          setNavState={shell.setNavState}
          workspaceSelect={({ isCollapsed }) => (
            <WorkspacePickerFixture isCollapsed={isCollapsed} />
          )}
          workspaceSelectId={workspace.id}
          workspaceSelectOpenRequest={workspace.openRequest}
          workspaceSelectVisible={workspace.visible}
          wsId="ws"
        />
      }
      sidebarUtility={
        <button
          aria-label="Settings"
          className={satelliteNavigationItemClass({
            isCollapsed: shell.isCollapsed,
          })}
          type="button"
        >
          <SidebarNavigationItemContent
            icon={<Settings className="size-4" />}
            isCollapsed={shell.isCollapsed}
            title="Settings"
          />
        </button>
      }
      userPopover={shell.isCollapsed ? <Avatar /> : null}
    >
      <CalendarGrid />
    </SatelliteShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
