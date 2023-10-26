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
        className="border-foreground/10 group flex items-center justify-center rounded-lg border bg-zinc-500/10 p-4 transition hover:bg-zinc-500/20 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
      >
        <PlusIcon className="h-6 w-6 text-zinc-700 transition group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-300" />
      </Link>
    );

  return (
    <button
      onClick={onClick}
      className="border-foreground/10 group flex items-center justify-center rounded-lg border bg-zinc-500/10 p-4 transition hover:bg-zinc-500/20 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <PlusIcon className="h-6 w-6 text-zinc-700 transition group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-300" />
    </button>
  );
};

export default PlusCardButton;
