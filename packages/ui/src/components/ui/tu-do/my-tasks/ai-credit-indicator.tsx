'use client';

import { Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface AiCreditIndicatorProps {
  wsId?: string;
}

function formatCredits(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return Math.round(value).toLocaleString();
}

function getProgressColor(percentUsed: number): string {
  if (percentUsed >= 90) return 'bg-dynamic-red';
  if (percentUsed >= 75) return 'bg-dynamic-orange';
  if (percentUsed >= 50) return 'bg-dynamic-yellow';
  return 'bg-dynamic-purple/60';
}

function getTextColor(percentUsed: number): string {
  if (percentUsed >= 90) return 'text-dynamic-red';
  if (percentUsed >= 75) return 'text-dynamic-orange';
  return 'text-dynamic-purple';
}

export function AiCreditIndicator({ wsId }: AiCreditIndicatorProps) {
  const t = useTranslations();
  const { data: credits, isLoading } = useAiCredits(wsId);

  if (isLoading || !credits) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Sparkles className="h-3 w-3 text-dynamic-purple" />
        <span>{t('ai-credits.title')}</span>
        <div className="h-1.5 w-16 animate-pulse overflow-hidden rounded-full bg-muted" />
      </div>
    );
  }

  const percentUsed = Math.min(credits.percentUsed, 100);
  const remaining = Math.max(credits.remaining, 0);
  const isExhausted = remaining <= 0;
  const progressWidth = 100 - percentUsed;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Sparkles className={cn('h-3 w-3', getTextColor(percentUsed))} />
            <span>{t('ai-credits.title')}</span>
            <Badge
              variant="outline"
              className="h-4 border-dynamic-purple/30 px-1 py-0 font-medium text-[10px] text-dynamic-purple"
            >
              {t('ai-credits.beta')}
            </Badge>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  getProgressColor(percentUsed)
                )}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <span className={cn('font-medium', getTextColor(percentUsed))}>
              {isExhausted
                ? t('ai-credits.exhausted')
                : formatCredits(remaining)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {isExhausted ? (
            <p>{t('ai-credits.exhausted_tooltip')}</p>
          ) : (
            <div className="space-y-1">
              <p>
                {credits.balanceScope === 'user'
                  ? t('ai-credits.scope_user_tooltip', {
                      used: formatCredits(credits.totalUsed),
                      total: formatCredits(
                        credits.totalAllocated + credits.bonusCredits
                      ),
                    })
                  : credits.seatCount
                    ? t('ai-credits.scope_workspace_seats_tooltip', {
                        used: formatCredits(credits.totalUsed),
                        total: formatCredits(
                          credits.totalAllocated + credits.bonusCredits
                        ),
                        seats: credits.seatCount,
                      })
                    : t('ai-credits.usage_tooltip', {
                        used: formatCredits(credits.totalUsed),
                        total: formatCredits(
                          credits.totalAllocated + credits.bonusCredits
                        ),
                      })}
              </p>
              <p className="text-muted-foreground">
                {t('ai-credits.tier_label', { tier: credits.tier })}
              </p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
