import {
  ArrowRightOnRectangleIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

import { useRouter } from 'next/router';
import { signOut } from '../../hooks/useUser';
import Logo from '../common/Logo';
import NavbarTab from './NavbarTab';

interface NavbarProps {
  className?: string;
}

export default function Navbar({ className }: NavbarProps) {
  const router = useRouter();

  return (
    <div
      className={`${className} w-[4.5rem] h-full fixed flex flex-col justify-center items-center top-0 left-0 bg-zinc-900`}
    >
      <div className="h-[95%] w-full flex flex-col justify-between items-center gap-16">
        <Logo className="flex-none" />
        <div className="grow flex flex-col gap-2">
          <NavbarTab
            href="/"
            currentPath={router.pathname}
            icon={<HomeIcon />}
            label="Dashboard"
          />
          <NavbarTab
            href="/tasks"
            currentPath={router.pathname}
            icon={<ClipboardDocumentListIcon />}
            label="Tasks"
          />
          <NavbarTab
            href="/calendar"
            currentPath={router.pathname}
            icon={<CalendarIcon />}
            label="Calendar"
          />
          <NavbarTab
            href="/settings"
            currentPath={router.pathname}
            icon={<Cog6ToothIcon />}
            label="Settings"
          />
        </div>
        <button
          className="flex-none m-1 p-2 hover:bg-zinc-300/10 hover:text-zinc-300 hover:border-zinc-600 rounded-full hover:cursor-pointer transition duration-150"
          onClick={signOut}
        >
          <ArrowRightOnRectangleIcon className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
