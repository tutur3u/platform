'use client';

import { ChevronDown, Sparkles } from '@tuturuuu/icons';
import { type ButtonProps, buttonVariants } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { forwardRef } from 'react';

interface MiraModelSelectorTriggerButtonProps {
  label: string;
}

export const MiraModelSelectorTriggerButton = forwardRef<
  HTMLButtonElement,
  MiraModelSelectorTriggerButtonProps & Omit<ButtonProps, 'children'>
>(function MiraModelSelectorTriggerButton(
  { className, label, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonVariants({ size: 'sm', variant: 'ghost' }),
        'h-8 min-w-0 max-w-full gap-1.5 rounded-full px-2.5 text-muted-foreground text-xs hover:bg-muted/70 hover:text-foreground',
        className
      )}
      {...props}
    >
      <Sparkles className="size-4 shrink-0" />
      <span>{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
    </button>
  );
});
