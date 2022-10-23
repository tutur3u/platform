import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { DEV_MODE } from '../../constants/common';

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  return (
    <div className={`${className} w-full flex justify-between items-center`}>
      {DEV_MODE && (
        <div className="px-4 py-2 text-xl font-semibold bg-purple-300/20 text-purple-300 rounded cursor-default">
          Development build
        </div>
      )}
      <div className="flex items-center gap-2">
        <button className="p-2 hover:bg-zinc-300/10 hover:text-zinc-300 hover:border-zinc-600 rounded hover:cursor-pointer transition duration-150">
          <MagnifyingGlassIcon className="w-6 h-6" />
        </button>
        <button className="p-2 hover:bg-zinc-300/10 hover:text-zinc-300 hover:border-zinc-600 rounded hover:cursor-pointer transition duration-150">
          <BellIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
