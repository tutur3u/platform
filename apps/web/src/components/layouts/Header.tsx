import { BellIcon } from '@heroicons/react/24/outline';
import { useAppearance } from '../../hooks/useAppearance';
import { Bars3Icon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';

export default function Header() {
  const { changeLeftSidebarMainPref } = useAppearance();

  return (
    <div className="fixed z-10 flex h-fit w-full items-center justify-between border-b border-zinc-700 bg-zinc-800/50 p-2 backdrop-blur-lg md:hidden">
      <button
        className="rounded p-2 transition hover:bg-zinc-300/10"
        onClick={() => changeLeftSidebarMainPref('open')}
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      <div className="flex items-center gap-2">
        <button className="cursor-not-allowed rounded p-2 text-zinc-500 transition">
          <MagnifyingGlassIcon className="h-6 w-6" />
        </button>
        <button className="cursor-not-allowed rounded p-2 text-zinc-500 transition">
          <BellIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
