import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@mantine/core';
import { useUser } from '../../hooks/useUser';

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const { user } = useUser();

  return (
    <div className={`${className} w-full flex justify-between items-center`}>
      <div className="text-xl font-semibold">
        <span>{user ? user?.email || user?.phone : 'Not logged in'}</span>
      </div>
      <div className="flex justify-around items-center">
        <button className="p-2 hover:bg-zinc-300/10 hover:text-zinc-300 hover:border-zinc-600 rounded-full hover:cursor-pointer transition duration-150">
          <MagnifyingGlassIcon className="w-6 h-6" />
        </button>
        <button className="p-2 hover:bg-zinc-300/10 hover:text-zinc-300 hover:border-zinc-600 rounded-full hover:cursor-pointer transition duration-150">
          <BellIcon className="w-6 h-6" />
        </button>
        <Avatar
          className="m-2 mr-0"
          //   src="/media/logos/transparent.png"
          //   href="/"
          size="md"
          radius="xl"
        />
      </div>
    </div>
  );
}
