import { Plus } from '@tuturuuu/ui/icons';
import Link from 'next/link';

interface Props {
  href?: string;
  onClick?: () => void;

  className?: string;
}

const MiniPlusButton = ({ href, onClick, className }: Props) => {
  if (href)
    return (
      <Link
        href={href}
        className={`border-border group flex items-center justify-center rounded-lg border bg-zinc-500/5 p-1 transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800 ${className}`}
      >
        <Plus className="h-4 w-4 text-zinc-700 transition group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-300" />
      </Link>
    );

  return (
    <button
      onClick={onClick}
      className={`border-border group flex items-center justify-center rounded-lg border bg-zinc-500/5 p-1 transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800 ${className}`}
    >
      <Plus className="h-4 w-4 text-zinc-700 transition group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-300" />
    </button>
  );
};

export default MiniPlusButton;
