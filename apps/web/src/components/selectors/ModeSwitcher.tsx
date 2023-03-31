import { ListBulletIcon, Squares2X2Icon } from '@heroicons/react/24/solid';

interface Props {
  mode?: 'list' | 'grid';
  onModeChange?: (mode: 'list' | 'grid') => void;
  className?: string;
}

const ModeSwitcher = ({ mode, onModeChange, className }: Props) => {
  return (
    <div className={`flex h-fit justify-end gap-4 ${className}`}>
      {onModeChange && (
        <div className="flex gap-2 rounded-lg border border-zinc-800 p-2">
          <button
            className={`${
              mode === 'list' ? 'bg-zinc-800' : 'text-zinc-700'
            } h-fit rounded-lg p-2 transition`}
            onClick={() => onModeChange('list')}
          >
            <ListBulletIcon className="h-6 w-6" />
          </button>
          <button
            className={`${
              mode === 'grid' ? 'bg-zinc-800' : 'text-zinc-700'
            } h-fit rounded-lg p-2 transition`}
            onClick={() => onModeChange('grid')}
          >
            <Squares2X2Icon className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ModeSwitcher;
