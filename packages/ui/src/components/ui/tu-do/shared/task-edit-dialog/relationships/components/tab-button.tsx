'use client';

import { cn } from '@tuturuuu/utils/format';
import type {
  TabButtonProps,
  TabColorVariant,
} from '../types/task-relationships.types';

const colorClasses: Record<
  TabColorVariant,
  { active: string; inactive: string }
> = {
  purple: {
    active: 'border-dynamic-purple text-dynamic-purple',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
  green: {
    active: 'border-dynamic-green text-dynamic-green',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
  red: {
    active: 'border-dynamic-red text-dynamic-red',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
  blue: {
    active: 'border-dynamic-blue text-dynamic-blue',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
};

export function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  color,
}: TabButtonProps) {
  const colors = colorClasses[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium text-xs transition-colors',
        active ? 'border-current' : 'border-transparent',
        active ? colors.active : colors.inactive
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
          {count}
        </span>
      )}
    </button>
  );
}
