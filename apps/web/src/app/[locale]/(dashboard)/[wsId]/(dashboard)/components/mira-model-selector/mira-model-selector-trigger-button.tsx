'use client';

import { ChevronDown } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { type ButtonProps, buttonVariants } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { forwardRef } from 'react';
import { ProviderLogo } from '../provider-logo';

interface MiraModelSelectorTriggerButtonProps {
  defaultModelId: string | null;
  model: AIModelUI;
  modelDefaultBadgeLabel: string;
}

export const MiraModelSelectorTriggerButton = forwardRef<
  HTMLButtonElement,
  MiraModelSelectorTriggerButtonProps & Omit<ButtonProps, 'children'>
>(function MiraModelSelectorTriggerButton(
  {
    className,
    defaultModelId,
    model,
    modelDefaultBadgeLabel,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonVariants({ size: 'sm', variant: 'ghost' }),
        'h-8 min-w-0 max-w-full gap-2 rounded-full px-3 font-mono text-muted-foreground text-sm',
        className
      )}
      {...props}
    >
      <ProviderLogo provider={model.provider} size={16} />
      <span className="min-w-0 truncate">{model.label}</span>
      {defaultModelId === model.value ? (
        <span className="rounded-full bg-dynamic-primary/12 px-2 py-0.5 font-sans text-[10px] text-dynamic-primary uppercase tracking-[0.18em]">
          {modelDefaultBadgeLabel}
        </span>
      ) : null}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
    </button>
  );
});
