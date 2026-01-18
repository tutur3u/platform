'use client';

import { cn } from '@tuturuuu/utils/format';

export function CountdownDigit({
  value,
  label,
  subLabel,
  colorClass,
}: {
  value: number;
  label: string;
  subLabel: string;
  colorClass: string;
}) {
  return (
    <div className="group/digit flex flex-col items-center gap-1">
      <div
        className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-xl border-2 shadow-lg transition-all duration-300 sm:h-14 sm:w-14',
          'hover:scale-105 hover:shadow-xl',
          colorClass
        )}
      >
        <span className="font-black text-xl tabular-nums sm:text-2xl">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="font-bold text-[9px] uppercase tracking-wider opacity-80 sm:text-[10px]">
          {label}
        </span>
        <span className="text-[8px] opacity-60 sm:text-[9px]">{subLabel}</span>
      </div>
    </div>
  );
}

export function CountdownSeparator({ colorClass }: { colorClass: string }) {
  return (
    <span
      className={cn(
        'self-start pt-4 font-black text-lg opacity-40',
        colorClass
      )}
    >
      :
    </span>
  );
}
