import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  FlaskConical,
  History,
  Layers,
  PanelLeftOpen,
  Settings,
  Users,
} from '@tuturuuu/icons';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SatelliteContent } from '@tuturuuu/ui/custom/satellite-content';
import { SatelliteFooterActions } from '@tuturuuu/ui/custom/satellite-footer-actions';
import { SatelliteShell } from '@tuturuuu/ui/custom/satellite-shell';
import { getFilteredLinks } from '@tuturuuu/ui/custom/satellite-shell-utils';
import { useSidebar } from '@tuturuuu/ui/custom/sidebar-context';
import { useSatelliteShell } from '@tuturuuu/ui/custom/use-satellite-shell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { ReportProblemDialogContent } from '@tuturuuu/ui/report-problem-dialog-content';
import { type ReactNode, useMemo, useState } from 'react';
import { AccountMenu } from './account-menu';
import logo from './assets/tuturuuu.png';
import { type Locale, useCopy, useShellCopy } from './i18n';
import { ColabNotifications } from './notifications';
import { ColabSettings } from './settings';
import { ShellNavigation } from './shell-navigation';
import { ThemeToggle } from './theme-toggle';

const persistCollapsed = (collapsed: boolean) =>
  localStorage.setItem('colab-sidebar-collapsed', String(collapsed));

/** Vite adapter for the same shell used by Tasks, Calendar and other satellites. */
export function Structure({
  children,
  loading,
  onLogout,
  onLocaleChange,
  identity,
  roomId,
  navigate,
}: {
  children: ReactNode;
  loading: boolean;
  onLogout: () => void;
  onLocaleChange: (locale: Locale | undefined) => void;
  identity: Identity | null;
  roomId: string;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  // Subscribe to the room cache so admin navigation follows realtime role changes.
  const { data: room } = useQuery<RoomView>({
    queryKey: ['room', roomId],
    enabled: false,
  });
  const t = useShellCopy();
  const sidebar = useSidebar();
  const [appsOpen, setAppsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useSettingsDialogShortcut({
    enabled: true,
    onOpen: () => setSettingsOpen(true),
  });
  const links = useMemo<(NavLink | null)[]>(
    () => [
      {
        title: c.studio.workshops,
        href: '/workshops',
        icon: <CalendarDays className="size-4" />,
      },
      ...(!roomId
        ? [
            {
              title: c.join,
              href: '/join',
              icon: <Users className="size-4" />,
            },
            ...(identity?.email?.endsWith('@tuturuuu.com')
              ? [
                  {
                    title: c.host,
                    href: '/host',
                    icon: <FlaskConical className="size-4" />,
                  },
                ]
              : []),
          ]
        : []),
      null,
      ...(roomId
        ? [
            {
              title: c.studio.overview,
              href: '#mission',
              icon: <BookOpen className="size-4" />,
            },
            {
              title: c.studio.editor,
              href: '#team-prompt',
              icon: <Users className="size-4" />,
            },
            {
              title: c.studio.skills,
              href: '#team-skills',
              icon: <FileText className="size-4" />,
            },
            {
              title: c.studio.sandbox,
              href: '#sandbox-desk',
              icon: <Layers className="size-4" />,
            },
            {
              title: c.studio.results,
              href: '#practice-journal',
              icon: <BookOpen className="size-4" />,
            },
            {
              title: c.studio.audit,
              href: '#activity',
              icon: <History className="size-4" />,
            },
            ...(room?.self.admin
              ? [
                  {
                    title: c.studio.controls,
                    href: '#controls',
                    icon: <Settings className="size-4" />,
                  },
                ]
              : []),
          ]
        : [
            {
              title: c.practiceGuide,
              href: '/guide',
              icon: <BookOpen className="size-4" />,
            },
          ]),
    ],
    [c, roomId, identity?.email, room?.self.admin]
  );
  const {
    isCollapsed: collapsed,
    setIsCollapsed,
    handleToggle,
    navState,
    setNavState,
    backButton,
    onMouseEnter,
    onMouseLeave,
  } = useSatelliteShell({
    pathname: roomId ? `/?room=${roomId}` : location.pathname,
    links,
    defaultCollapsed:
      window.innerWidth < 768 ||
      localStorage.getItem('colab-sidebar-collapsed') === 'true',
    persistCollapsed,
    behavior: sidebar.behavior,
    handleBehaviorChange: sidebar.handleBehaviorChange,
    backLabel: c.back,
  });
  const account = (compact: boolean) => (
    <AccountMenu
      identity={identity}
      loading={loading}
      compact={compact}
      onReport={() => setFeedbackOpen(true)}
      onLogout={onLogout}
      onLocaleChange={onLocaleChange}
    />
  );
  const notifications = identity?.email ? (
    <ColabNotifications userId={identity.id} />
  ) : undefined;
  return (
    <div className="colab-shell">
      {sidebar.behavior === 'hidden' && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 left-4 z-50"
          aria-label={c.shellExpand}
          onClick={() => sidebar.handleBehaviorChange('expanded')}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      )}
      <ReportProblemDialogContent
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        showTrigger={false}
        t={(key, values) => t(`common.${key}`, values)}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <ColabSettings
          onLocaleChange={onLocaleChange}
          onClose={() => setSettingsOpen(false)}
          onReport={() => setFeedbackOpen(true)}
        />
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
        overlayOnExpand={sidebar.behavior === 'hover'}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        sidebarHidden={sidebar.behavior === 'hidden'}
      >
        <div className="colab-content">{children}</div>
      </SatelliteShell>
    </div>
  );
}
