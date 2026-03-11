'use client';

import { ChevronDown } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { ProviderLogo } from '../provider-logo';

interface MiraModelSelectorTriggerButtonProps {
  defaultModelId: string | null;
  disabled?: boolean;
  model: AIModelUI;
  modelDefaultBadgeLabel: string;
}

export function MiraModelSelectorTriggerButton({
  defaultModelId,
  disabled,
  model,
  modelDefaultBadgeLabel,
}: MiraModelSelectorTriggerButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 min-w-0 max-w-full gap-2 rounded-full px-3 font-mono text-muted-foreground text-sm"
      disabled={disabled}
    >
      <ProviderLogo provider={model.provider} size={16} />
      <span className="min-w-0 truncate">{model.label}</span>
      {defaultModelId === model.value ? (
        <span className="rounded-full bg-dynamic-primary/12 px-2 py-0.5 font-sans text-[10px] text-dynamic-primary uppercase tracking-[0.18em]">
          {modelDefaultBadgeLabel}
        </span>
      ) : null}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
    </Button>
  );
}
