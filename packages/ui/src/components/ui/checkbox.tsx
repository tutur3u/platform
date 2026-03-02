'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon, MinusIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-ring/50 ring-ring/10 transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:focus-visible:ring-0 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary/80 data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground dark:outline-ring/40 dark:ring-ring/20',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-transform duration-100"
      >
        <CheckboxIndeterminateIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/**
 * Renders the appropriate icon based on the parent checkbox state.
 * Radix sets `data-state` on the Indicator's parent Root, and the Indicator
 * is only mounted when state is `checked` or `indeterminate`.
 * We use CSS attribute selectors to conditionally show the right icon.
 */
function CheckboxIndeterminateIcon() {
  return (
    <>
      {/* Checkmark: shown when parent state is "checked" */}
      <CheckIcon className="hidden size-3.5 [[data-state=checked]_&]:block" />
      {/* Minus: shown when parent state is "indeterminate" */}
      <MinusIcon className="hidden size-3.5 stroke-[3] [[data-state=indeterminate]_&]:block" />
    </>
  );
}

export { Checkbox };
