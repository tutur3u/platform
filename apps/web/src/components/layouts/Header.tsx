import { BellIcon } from '@heroicons/react/24/outline';
import { useAppearance } from '../../hooks/useAppearance';
import { Bars3Icon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';

export default function Header() {
  const { segments, changeLeftSidebarMainPref } = useAppearance();

  const getSegmentColor = (index: number) => {
    const colors = [
      'bg-blue-300/20 text-blue-300 hover:bg-blue-300/10',
      'bg-indigo-300/20 text-indigo-300 hover:bg-indigo-300/10',
      'bg-purple-300/20 text-purple-300 hover:bg-purple-300/10',
      'bg-pink-300/20 text-pink-300 hover:bg-pink-300/10',
      'bg-green-300/20 text-green-300 hover:bg-green-300/10',
      'bg-red-300/20 text-red-300 hover:bg-red-300/10',
      'bg-yellow-300/20 text-yellow-300 hover:bg-yellow-300/10',
    ];

    return colors[index % colors.length];
  };

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
