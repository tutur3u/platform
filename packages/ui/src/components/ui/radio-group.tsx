'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { CircleIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs outline-ring/50 ring-ring/10 transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:focus-visible:ring-0 dark:outline-ring/40 dark:ring-ring/20',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
