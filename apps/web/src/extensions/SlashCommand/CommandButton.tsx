import { Icon } from '@/components/components/ui/Icon';
import { icons } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { forwardRef } from 'react';

export type CommandButtonProps = {
  active?: boolean;
  description: string;
  icon: keyof typeof icons;
  onClick: () => void;
  title: string;
};

export const CommandButton = forwardRef<HTMLButtonElement, CommandButtonProps>(
  ({ active, icon, onClick, title }, ref) => {
    const wrapperClass = cn(
      'flex items-center justify-start gap-2 rounded p-1.5 text-xs font-semibold text-neutral-500',
      !active && 'bg-transparent hover:bg-neutral-50 hover:text-black',
      active && 'bg-neutral-100 text-black hover:bg-neutral-100'
    );

    return (
      <button ref={ref} onClick={onClick} className={wrapperClass}>
        <Icon name={icon} className="h-3 w-3" />
        <div className="flex flex-col items-start justify-start">
          <div className="text-sm font-medium">{title}</div>
        </div>
      </button>
    );
  }
);

CommandButton.displayName = 'CommandButton';
