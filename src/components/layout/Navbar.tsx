import { Bars3Icon } from '@heroicons/react/24/outline';
import { Avatar } from '@mantine/core';
import { useSidebar } from '../../hooks/useSidebar';
import Logo from '../common/Logo';

interface NavbarProps {
  className?: string;
}

export default function Navbar({ className }: NavbarProps) {
  const { isCollapsed, toggle } = useSidebar();

  return (
    <div
      className={`${className} h-16 border-b border-zinc-800/80 bg-zinc-900 sticky p-7 top-0 items-center flex z-10`}
    >
      <Bars3Icon
        onClick={toggle}
        className="md:hidden w-11 p-1 md:p-0 mr-4 hover:cursor-pointer hover:bg-blue-300/20 hover:text-blue-300 transition duration-75 rounded-md"
      />
      <Logo showLogo={isCollapsed} showLabel />
      <div className="mr-7 absolute right-0 w-9 bg-red-200">
        <Avatar />
      </div>
    </div>
  );
}
