'use client';

import { Sparkles } from '@tuturuuu/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

export function AiCreditIndicator() {
  const t = useTranslations();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Sparkles className="h-3 w-3 text-dynamic-purple" />
            <span>AI Credits</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full rounded-full bg-dynamic-purple/60" />
            </div>
            <span className="font-medium text-dynamic-purple">
              {t('ws-tasks.ai_credits_unlimited', {
                fallback: 'Unlimited',
              })}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            AI task generation is currently unlimited. Credit tracking coming
            soon.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
