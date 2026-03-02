'use client';

import { useQuery } from '@tanstack/react-query';
import { cn, formatCompactNumber } from '@tuturuuu/utils/format';

interface CreditSourceInlineBarProps {
  wsId?: string;
  t: (...args: any[]) => string;
}

interface CreditData {
  totalAllocated: number;
  totalUsed: number;
  remaining: number;
  percentUsed: number;
  tier: string;
  bonusCredits: number;
}

export function CreditSourceInlineBar({ wsId, t }: CreditSourceInlineBarProps) {
  const { data, isLoading } = useQuery<CreditData>({
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

  if (isLoading) {
    return (
      <div className="mt-0.5 flex items-center gap-2">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-foreground/10" />
      </div>
    );
  }

  if (!data || data.totalAllocated + data.bonusCredits === 0) return null;

  const total = data.totalAllocated + data.bonusCredits;
  const remaining = Math.max(0, total - data.totalUsed);
  const percentRemaining = Math.max(
    0,
    Math.min(100, (remaining / total) * 100)
  );

  return (
    <div className="mt-0.5 flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
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
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatCompactNumber(remaining)} {t('credits_remaining_short')}
      </span>
    </div>
  );
}
