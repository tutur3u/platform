import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { type OpsTone, opsToneClasses } from './status-tone';

export interface StatusPillProps {
  children: ReactNode;
  className?: string;
  title?: string;
  tone: OpsTone;
}

export function StatusPill({
  children,
  className,
  title,
  tone,
}: StatusPillProps) {
  const classes = opsToneClasses[tone];

  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs',
        classes.soft,
        classes.text,
        className
      )}
      data-tone={tone}
      title={title}
    >
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', classes.dot)}
      />
      {children}
    </span>
  );
}
