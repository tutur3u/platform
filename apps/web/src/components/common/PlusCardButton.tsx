import { PlusIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';

interface Props {
  href?: string;
  onClick?: () => void;
}

const PlusCardButton = ({ href, onClick }: Props) => {
  if (href)
    return (
      <Link
        href={href}
        className="group flex items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 p-4 transition hover:bg-zinc-800"
      >
        <PlusIcon className="h-6 w-6 text-zinc-500 transition group-hover:text-zinc-300" />
      </Link>
    );

  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 p-4 transition hover:bg-zinc-800"
    >
      <PlusIcon className="h-6 w-6 text-zinc-500 transition group-hover:text-zinc-300" />
    </button>
  );
};

export default PlusCardButton;
