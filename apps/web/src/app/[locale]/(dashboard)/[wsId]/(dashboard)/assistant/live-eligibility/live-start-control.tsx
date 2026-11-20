'use client';

import { AudioLines, Lock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { LiveEntryState } from '@/hooks/use-live-eligibility';

/**
 * Live start control. Blocked accounts see a lock and a short reason, and
 * activating it explains the block instead of connecting.
 */
export function LiveStartControl({
  entry,
  onStart,
}: {
  entry?: LiveEntryState;
  onStart: () => void;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  if (entry?.status === 'blocked') {
    const reason = t(`live_blocked.short.${entry.eligibility.reason}`);
    return (
      <Button
        variant="ghost"
        className="h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-muted-foreground text-xs"
        aria-haspopup="dialog"
        aria-label={t('live_blocked.locked_label', { reason })}
        data-live-entry="blocked"
        onClick={onStart}
      >
        <Lock aria-hidden className="size-3.5" />
        <span>{reason}</span>
      </Button>
    );
  }
  const checking = entry?.status === 'checking';
  const label = checking ? t('live_blocked.checking') : t('live_mode');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 rounded-xl"
          aria-busy={checking || undefined}
          aria-label={label}
          data-live-entry={entry?.status ?? 'eligible'}
          disabled={checking}
          onClick={onStart}
        >
          <AudioLines
            aria-hidden
            className={cn(
              'size-4',
              checking && 'animate-pulse motion-reduce:animate-none'
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
