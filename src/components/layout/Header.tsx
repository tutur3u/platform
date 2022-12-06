import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@mantine/core';
import Link from 'next/link';
import { useAppearance } from '../../hooks/useAppearance';

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
    <div className="flex h-fit w-full items-center justify-between md:hidden">
      <Avatar
        className="block hover:cursor-pointer md:hidden"
        size={37}
        color="blue"
        radius="xl"
        onClick={() => changeLeftSidebarMainPref('open')}
      />
      <div className="hidden md:block">
        {segments.length > 0 ? (
          <div className="flex items-center gap-2">
            {segments.map((segment, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && <span className="text-xl text-zinc-500">/</span>}
                <Link
                  href={segment.href}
                  className={`rounded-full px-6 py-2 text-xl font-bold ${getSegmentColor(
                    index
                  )} transition duration-300`}
                >
                  {segment.content}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="rounded p-2 transition duration-150 hover:cursor-pointer hover:border-zinc-600 hover:bg-zinc-300/10 hover:text-zinc-300">
          <MagnifyingGlassIcon className="h-6 w-6" />
        </button>
        <button className="rounded p-2 transition duration-150 hover:cursor-pointer hover:border-zinc-600 hover:bg-zinc-300/10 hover:text-zinc-300">
          <BellIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
