'use client';

import { cn } from '@tuturuuu/utils/format';
import type {
  TabButtonProps,
  TabColorVariant,
} from '../types/task-relationships.types';

const colorClasses: Record<
  TabColorVariant,
  { active: string; inactive: string; badge: string }
> = {
  purple: {
    active:
      'border-dynamic-purple/40 bg-dynamic-purple/10 text-dynamic-purple shadow-sm',
    inactive:
      'border-border/60 bg-background/60 text-muted-foreground hover:border-dynamic-purple/25 hover:text-foreground',
    badge: 'bg-dynamic-purple/12 text-dynamic-purple',
  },
  green: {
    active:
      'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green shadow-sm',
    inactive:
      'border-border/60 bg-background/60 text-muted-foreground hover:border-dynamic-green/25 hover:text-foreground',
    badge: 'bg-dynamic-green/12 text-dynamic-green',
  },
  red: {
    active:
      'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red shadow-sm',
    inactive:
      'border-border/60 bg-background/60 text-muted-foreground hover:border-dynamic-red/25 hover:text-foreground',
    badge: 'bg-dynamic-red/12 text-dynamic-red',
  },
  blue: {
    active:
      'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue shadow-sm',
    inactive:
      'border-border/60 bg-background/60 text-muted-foreground hover:border-dynamic-blue/25 hover:text-foreground',
    badge: 'bg-dynamic-blue/12 text-dynamic-blue',
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
        'flex items-center gap-1.5 rounded-full border px-3 py-2 font-medium text-xs transition-all',
        active ? colors.active : colors.inactive
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
            active ? colors.badge : 'bg-muted text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
