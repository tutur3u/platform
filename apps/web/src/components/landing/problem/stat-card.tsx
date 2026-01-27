'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
}

export function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border p-6 text-center transition-all hover:shadow-lg',
        `border-dynamic-${color}/20 bg-gradient-to-b from-dynamic-${color}/5 to-transparent hover:border-dynamic-${color}/30`
      )}
    >
      <div
        className={cn(
          'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full',
          `bg-dynamic-${color}/10`
        )}
      >
        <Icon className={cn('h-6 w-6', `text-dynamic-${color}`)} />
      </div>
      <div className={cn('mb-1 font-bold text-4xl', `text-dynamic-${color}`)}>
        {value}
      </div>
      <div className="text-foreground/60 text-sm">{label}</div>
    </div>
  );
}
