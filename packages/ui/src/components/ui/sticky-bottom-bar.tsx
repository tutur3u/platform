import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface StickyBottomBarProps {
  show: boolean;
  message: ReactNode;
  actions: ReactNode;
  className?: string;
  containerClassName?: string;
  pulseDotClassName?: string;
}

export function StickyBottomBar({
  show,
  message,
  actions,
  className,
  containerClassName,
  pulseDotClassName,
}: StickyBottomBarProps) {
  if (!show) return null;

  return (
    <div
      className={cn(
        'fixed right-0 bottom-2 left-0 z-50 rounded-2xl bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:right-auto md:left-1/2 md:-translate-x-1/2',
        className
      )}
    >
      <div
        className={cn(
          'flex w-full items-center justify-between px-4 py-4 md:w-[42rem] md:px-6 lg:w-[56rem] lg:px-10',
          containerClassName
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 animate-pulse rounded-full bg-amber-500',
              pulseDotClassName
            )}
          ></div>
          <span className="text-balance font-medium text-foreground text-sm">
            {message}
          </span>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
