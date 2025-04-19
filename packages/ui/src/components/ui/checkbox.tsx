'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '@tuturuuu/utils/format';
import { CheckIcon } from 'lucide-react';
import * as React from 'react';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'border-input shadow-xs ring-ring/10 outline-ring/50 aria-invalid:focus-visible:ring-0 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:ring-ring/20 dark:outline-ring/40 peer size-4 shrink-0 rounded-[4px] border transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
