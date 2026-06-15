'use client';

import { CircleHelp } from '@tuturuuu/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface Props {
  /** Tooltip text shown on hover/focus. Also used as the accessible label. */
  label: string;
  /** Custom trigger. Defaults to a small help icon. */
  children?: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/**
 * Standardized guidance tooltip used across the topic-announcements feature.
 * Keeps trigger markup consistent and ensures every tip is keyboard/aria
 * accessible.
 */
export function TopicAnnouncementsHelpTip({
  label,
  children,
  side = 'top',
  className,
}: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ?? (
            <button
              aria-label={label}
              className={cn(
                'inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none',
                className
              )}
              type="button"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-pretty" side={side}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
