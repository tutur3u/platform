'use client';

import { CloudAlert, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { MailSyncState } from './use-mail-thread-actions';

export function MailSyncStatus({
  state,
  refreshing,
  onRefresh,
}: {
  state: MailSyncState;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('mail');
  const busy = refreshing || state === 'syncing';
  const failed = state === 'failed';
  const Icon = failed && !busy ? CloudAlert : RefreshCw;
  const label = busy ? t('syncing') : failed ? t('sync_failed') : t('synced');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={`${t('refresh')}: ${label}`}
          aria-busy={busy}
          aria-disabled={busy}
          className={cn(failed && 'text-destructive')}
          onClick={() => {
            if (!busy) onRefresh();
          }}
          size="icon"
          variant="ghost"
        >
          <Icon className={cn('size-4', busy && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p className="font-medium">{t('refresh')}</p>
        <p role="status">{label}</p>
        <p className="mt-1 text-xs leading-5">
          {failed ? t('sync_failed_description') : t('sync_description')}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
