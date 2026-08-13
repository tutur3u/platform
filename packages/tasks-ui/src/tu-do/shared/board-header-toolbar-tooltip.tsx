import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';

export function BoardHeaderToolbarTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
