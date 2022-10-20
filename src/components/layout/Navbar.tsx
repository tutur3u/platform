import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { useSidebar } from '../../hooks/useSidebar';
import { useUser, signOut } from '../../hooks/useUser';
import Logo from '../common/Logo';

interface NavbarProps {
  className?: string;
}

export default function Navbar({ className }: NavbarProps) {
  const { isCollapsed, toggle } = useSidebar();
  const { user } = useUser();

  return (
    <div
      className={`${className} border-b border-zinc-800/80 bg-zinc-900 sticky top-0 z-10 overflow-y-hidden`}
    >
      <div className="px-4 py-2 flex items-center justify-between">
        <Bars3Icon
          onClick={toggle}
          className="md:hidden w-8 p-1 md:p-0 mr-4 hover:cursor-pointer hover:bg-blue-300/20 hover:text-blue-300 transition duration-75 rounded-md"
        />
        <Logo showLogo={isCollapsed} showLabel />
        <div className="flex items-center gap-4">
          <div>{user ? user?.email || user?.phone : 'Not logged in'}</div>
          <button
            className="p-1 bg-zinc-800 hover:bg-red-500/30 hover:text-red-300 border border-zinc-700 hover:border-red-300/10 rounded transition duration-150"
            onClick={signOut}
          >
            <ArrowRightOnRectangleIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
