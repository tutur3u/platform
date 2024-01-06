import { useAppearance } from '../../hooks/useAppearance';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import SidebarLink from './SidebarLink';
import {
  CalendarDaysIcon,
  BanknotesIcon,
  BellIcon,
  EllipsisHorizontalCircleIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

export default function BottomNavbar() {
  const { ws } = useWorkspaces();

  const { setSidebar } = useAppearance();

  const getWorkspaceHome = (url: string) =>
    ws?.id
      ? // Remove trailing slash
        `/${ws.id}/${url}`.replace(/\/$/, '')
      : `/onboarding?nextUrl=${url}&withWorkspace=true`;

  return (
    <div className="border-border fixed bottom-0 z-[100] flex w-full items-center justify-between gap-2 border-t bg-white/50 p-2 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-[#111113]/50">
      <SidebarLink
        href={getWorkspaceHome('')}
        activeIcon={<HomeIcon className="w-5" />}
        showLabel={false}
        classNames={{
          root: 'w-full',
        }}
        exactMatch
      />
      <SidebarLink
        href={getWorkspaceHome('calendar')}
        activeIcon={<CalendarDaysIcon className="w-5" />}
        showLabel={false}
        classNames={{
          root: 'w-full',
        }}
      />
      <SidebarLink
        href={getWorkspaceHome('finance')}
        activeIcon={<BanknotesIcon className="w-5" />}
        showLabel={false}
        classNames={{
          root: 'w-full',
        }}
      />
      <SidebarLink
        href={getWorkspaceHome('notifications')}
        activeIcon={<BellIcon className="w-5" />}
        showLabel={false}
        classNames={{
          root: 'w-full',
        }}
      />
      <SidebarLink
        onClick={() => setSidebar('open')}
        activeIcon={<EllipsisHorizontalCircleIcon className="w-5" />}
        showLabel={false}
        classNames={{
          root: 'w-full',
        }}
        disableAutoClose
      />
    </div>
  );
}
