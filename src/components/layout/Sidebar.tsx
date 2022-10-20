import {
  ClipboardDocumentListIcon,
  CalendarIcon,
  Cog6ToothIcon,
  ChevronDoubleLeftIcon,
} from '@heroicons/react/24/outline';

import { HomeIcon } from '@heroicons/react/24/solid';

import { useSidebar } from '../../hooks/useSidebar';
import Logo from '../common/Logo';
import { useRouter } from 'next/router';
import SidebarTab from './SidebarTab';
import styles from './sidebar.module.css';
import { APP_VERSION } from '../../constants/common';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const router = useRouter();

  return (
    <div
      className={`${className} group z-20 h-full fixed flex-col justify-center items-center top-0 left-0 border-r border-zinc-800/80 bg-zinc-900/50 backdrop-blur-lg`}
    >
      <div className="w-full h-full flex flex-col">
        <div className="px-1 mt-2 relative flex justify-start overflow-hidden border-b border-zinc-800 pb-4 mx-3">
          <Logo showLabel />
        </div>
        <div className={`${styles.sidebar} overflow-scroll h-full`}>
          <div className="p-3 flex flex-col items-center">
            <SidebarTab
              href="/"
              currentPath={router.pathname}
              icon={<HomeIcon />}
              label="Home"
            />
            <SidebarTab
              href="/tasks"
              currentPath={router.pathname}
              icon={<ClipboardDocumentListIcon />}
              label="Tasks"
            />
            <SidebarTab
              href="/calendar"
              currentPath={router.pathname}
              icon={<CalendarIcon />}
              label="Calendar"
            />
            <SidebarTab
              href="/settings"
              currentPath={router.pathname}
              icon={<Cog6ToothIcon />}
              label="Settings"
            />
          </div>
        </div>
        <div className="opacity-0 whitespace-nowrap group-hover:opacity-100 transition group-hover:duration-500 group-hover:delay-200 p-2 text-center text-zinc-500 font-semibold text-sm cursor-default">
          Version {APP_VERSION}
        </div>
      </div>
    </div>
  );
}

export function ProjectSidebar({ className }: SidebarProps) {
  const { isCollapsed, toggle } = useSidebar();

  const router = useRouter();

  return (
    <div
      className={`${className} z-20 h-full fixed flex-col justify-center items-center top-0 left-0 border-r border-zinc-800/80 bg-zinc-900`}
    >
      <div className="w-full h-full flex flex-col">
        <div
          className={`mt-2 relative flex ${
            isCollapsed ? 'justify-center' : 'justify-end'
          }`}
        >
          {isCollapsed || (
            <div className="top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] absolute">
              <Logo />
            </div>
          )}
          <button
            className="rounded-md m-2 p-2 hover:bg-blue-300/20 hover:text-blue-300"
            onClick={toggle}
          >
            <ChevronDoubleLeftIcon
              className={`${isCollapsed && 'rotate-180'} w-6 h-6`}
            />
          </button>
        </div>
        <div className={`${styles.sidebar} overflow-scroll`}>
          <div className="p-3 flex flex-col items-center">
            <SidebarTab
              href="/"
              currentPath={router.pathname}
              icon={<HomeIcon />}
              label="Dashboard"
            />
            <SidebarTab
              href="/tasks"
              currentPath={router.pathname}
              icon={<ClipboardDocumentListIcon />}
              label="Tasks"
            />
            <SidebarTab
              href="/calendar"
              currentPath={router.pathname}
              icon={<CalendarIcon />}
              label="Calendar"
            />
            <SidebarTab
              href="/settings"
              currentPath={router.pathname}
              icon={<Cog6ToothIcon />}
              label="Settings"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
