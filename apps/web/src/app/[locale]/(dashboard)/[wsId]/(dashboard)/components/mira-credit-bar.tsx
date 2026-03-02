'use client';

import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn, formatCompactNumber } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface MiraCreditBarProps {
  wsId?: string;
}

interface CreditData {
  totalAllocated: number;
  totalUsed: number;
  remaining: number;
  percentUsed: number;
  tier: string;
  bonusCredits: number;
  included: {
    totalAllocated: number;
    totalUsed: number;
    bonusCredits: number;
    remaining: number;
  };
  payg: {
    totalGranted: number;
    totalUsed: number;
    remaining: number;
    nextExpiry: string | null;
  };
}

export default function MiraCreditBar({ wsId }: MiraCreditBarProps) {
  const t = useTranslations('dashboard.mira_chat');

  const { data } = useQuery<CreditData>({
    queryKey: ['ai-credits', wsId],
    queryFn: () =>
      fetch(`/api/v1/workspaces/${wsId}/ai/credits`, {
        cache: 'no-store',
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch credits');
        return r.json();
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: !!wsId,
  });

  if (!data || data.totalAllocated + data.bonusCredits === 0) return null;

  const total = data.totalAllocated + data.bonusCredits;
  const percentRemaining = Math.max(
    0,
    Math.min(100, ((total - data.totalUsed) / total) * 100)
  );

  const planTotal = data.included.totalAllocated + data.included.bonusCredits;
  const planRemaining = Math.max(0, data.included.remaining);
  const paygTotal = data.payg.totalGranted;
  const paygRemaining = Math.max(0, data.payg.remaining);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex cursor-default items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                percentRemaining > 30
                  ? 'bg-dynamic-green'
                  : percentRemaining > 10
                    ? 'bg-dynamic-yellow'
                    : 'bg-dynamic-red'
              )}
              style={{ width: `${percentRemaining}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {Math.round(percentRemaining)}%
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between gap-4 font-medium">
            <span>{t('credit_meter_used')}</span>
            <span className="font-mono">
              {formatCompactNumber(data.totalUsed)} /{' '}
              {formatCompactNumber(total)}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">
              {t('credit_meter_plan')}
            </span>
            <span className="font-mono text-muted-foreground">
              {formatCompactNumber(planRemaining)} /{' '}
              {formatCompactNumber(planTotal)}
            </span>
          </div>
          {paygTotal > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {t('credit_meter_payg')}
              </span>
              <span className="font-mono text-muted-foreground">
                {formatCompactNumber(paygRemaining)} /{' '}
                {formatCompactNumber(paygTotal)}
              </span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
