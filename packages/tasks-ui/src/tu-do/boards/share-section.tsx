'use client';

import { ChevronDown, Info } from '@tuturuuu/icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

function ShareInfoTooltip({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={label}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ShareSectionProps {
  children: ReactNode;
  icon: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  statusBadge: ReactNode;
  title: string;
  tooltip: string;
}

export function ShareSection({
  children,
  icon,
  onOpenChange,
  open,
  statusBadge,
  title,
  tooltip,
}: ShareSectionProps) {
  const t = useTranslations();

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="rounded-md border"
    >
      <div className="flex min-h-11 items-center gap-2 px-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-foreground"
          >
            {icon}
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {title}
            </span>
            {statusBadge}
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>
        <ShareInfoTooltip
          label={t('ws-task-boards.share.note')}
          content={tooltip}
        />
      </div>
      <CollapsibleContent className="border-t p-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
