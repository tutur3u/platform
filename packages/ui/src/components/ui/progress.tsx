'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

function Progress({
  className,
  indicatorClassName,
  indicatorStyle,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  indicatorStyle?: React.CSSProperties;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full flex-1 bg-primary transition-all',
          indicatorClassName
        )}
        style={{
          transform: `translateX(-${100 - (value || 0)}%)`,
          ...indicatorStyle,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
