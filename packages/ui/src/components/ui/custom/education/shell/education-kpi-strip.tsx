import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export interface EducationKpiItem {
  icon?: ReactNode;
  label: ReactNode;
  tone?: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'sky';
  value: ReactNode;
}

interface EducationKpiStripProps {
  className?: string;
  items: EducationKpiItem[];
}

const toneClassByTone: Record<NonNullable<EducationKpiItem['tone']>, string> = {
  blue: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
  green: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
  orange: 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
  purple: 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
  red: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
  sky: 'border-dynamic-sky/20 bg-dynamic-sky/10 text-dynamic-sky',
};

export function EducationKpiStrip({
  className,
  items,
}: EducationKpiStripProps) {
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((item, index) => (
        <div
          key={`${index}-${String(item.label)}`}
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm',
            toneClassByTone[item.tone ?? 'blue']
          )}
        >
          <div className="flex items-center gap-2">
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </div>
          <span className="font-semibold">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
