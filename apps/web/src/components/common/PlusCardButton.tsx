import { PlusIcon } from '@heroicons/react/24/solid';

interface Props {
  onClick?: () => void;
}

const PlusCardButton = ({ onClick }: Props) => {
  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-center rounded-lg border border-zinc-800/80 bg-zinc-900 p-8 transition hover:bg-zinc-800"
    >
      <PlusIcon className="h-6 w-6 text-zinc-500 transition group-hover:text-zinc-300" />
    </button>
  );
};

export default PlusCardButton;
