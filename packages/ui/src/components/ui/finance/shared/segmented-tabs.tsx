'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../tabs';

export interface FinanceSegmentedTabsOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  /** Accessible name, when the visible label needs more context. */
  ariaLabel?: string;
}

interface FinanceSegmentedTabsProps<TValue extends string> {
  value: TValue;
  options: readonly FinanceSegmentedTabsOption<TValue>[];
  onValueChange: (value: TValue) => void;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
  triggerClassName?: string;
}

/**
 * A compact segmented switch on the design-system Tabs: a recessed track with
 * a raised active thumb, sized (h-8) to sit beside small buttons. Radix
 * supplies the tablist semantics, roving focus and arrow-key selection.
 */
export function FinanceSegmentedTabs<TValue extends string>({
  value,
  options,
  onValueChange,
  label,
  className,
  triggerClassName,
}: FinanceSegmentedTabsProps<TValue>) {
  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => {
        const option = options.find((item) => item.value === nextValue);
        if (option) onValueChange(option.value);
      }}
      className={cn('gap-0', className)}
    >
      <TabsList aria-label={label} className="h-8">
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            aria-label={option.ariaLabel}
            // These tabs switch a view shown elsewhere, so there is no tab
            // panel to point at; a dangling id would mislead assistive tech.
            aria-controls={undefined}
            className={cn('px-3 py-0.5', triggerClassName)}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
