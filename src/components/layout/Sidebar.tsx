import {
  ClipboardDocumentListIcon,
  CalendarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

import { HomeIcon } from '@heroicons/react/24/solid';

import SidebarTab from './SidebarTab';
import { APP_VERSION } from '../../constants/common';
import { useRouter } from 'next/router';
import Logo from '../common/Logo';

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
        <div className={`overflow-scroll h-full`}>
          <div className="p-[0.65rem] flex flex-col items-start">
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
        <div className="opacity-0 whitespace-nowrap group-hover:opacity-100 transition group-hover:duration-500 group-hover:delay-200 p-2 text-center text-zinc-500 font-semibold text-sm cursor-default">
          Version {APP_VERSION}
        </div>
      </div>
    </div>
  );
}
