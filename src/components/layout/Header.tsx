import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface HeaderProps {
  label?: string;
  className?: string;
}

export default function Header({ label, className }: HeaderProps) {
  return (
    <div
      className={`${className} mb-4 w-full flex justify-between items-center`}
    >
      {label ? (
        <div className="px-6 py-2 text-3xl font-bold bg-purple-300/20 text-purple-300 rounded-full cursor-default">
          {label}
        </div>
      ) : (
        <div />
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
