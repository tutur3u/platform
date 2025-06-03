'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@ncthub/utils/format';
import * as React from 'react';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'shadow-xs ring-ring/10 outline-ring/50 focus-visible:outline-hidden aria-invalid:focus-visible:ring-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:ring-ring/20 dark:outline-ring/40 peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-background pointer-events-none block size-4 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
