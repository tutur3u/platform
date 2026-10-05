'use client';

import { CloudOff, Loader2 } from '@tuturuuu/icons';
import type { DocumentCheckpointStatus } from '@tuturuuu/realtime/documents';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

export function DocumentStatus({
  connected,
  checkpoint,
}: {
  connected: boolean;
  checkpoint: DocumentCheckpointStatus | null;
}) {
  const t = useTranslations('meet.collaboration');
  const warning = checkpoint && checkpoint !== 'saved';
  const message = t(
    checkpoint === 'conflict' ? 'checkpoint_conflict' : 'checkpoint_deferred'
  );
  return (
    <div className="flex items-center gap-2">
      {!connected && (
        <span
          role="status"
          className="flex items-center gap-1.5 text-muted-foreground text-xs"
        >
          <Loader2
            className="size-3 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t('reconnecting')}
        </span>
      )}
      {warning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-dynamic-orange"
              aria-label={message}
            >
              <CloudOff className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{message}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
