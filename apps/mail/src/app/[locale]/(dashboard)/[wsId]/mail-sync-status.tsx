'use client';

import { CloudAlert, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { MailSyncState } from './use-mail-thread-actions';
import { useSettlingSpin } from './use-settling-spin';

export function MailSyncStatus({
  state,
  refreshing,
  onRefresh,
}: {
  state: MailSyncState;
  refreshing: boolean;
  onRefresh: () => unknown;
}) {
  const t = useTranslations('mail');
  const refreshingRef = useRef(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const busy = refreshing || state === 'syncing';
  useSettlingSpin(iconRef, busy);
  const failed = state === 'failed' && !busy;
  const Icon = failed ? CloudAlert : RefreshCw;
  const label = busy ? t('syncing') : failed ? t('sync_failed') : t('synced');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={`${t('refresh')}: ${label}`}
          aria-busy={busy}
          aria-disabled={busy}
          className={cn(failed && 'text-destructive')}
          onClick={async () => {
            if (busy || refreshingRef.current) return;
            refreshingRef.current = true;
            try {
              if (failed) toast.error(t('sync_failed_description'));
              await onRefresh();
            } catch {
              toast.error(t('load_failed'));
            } finally {
              refreshingRef.current = false;
            }
          }}
          size="icon"
          variant="ghost"
        >
          <span
            ref={iconRef}
            className={cn(
              'flex transition-opacity',
              busy && 'motion-reduce:opacity-50'
            )}
          >
            <Icon className="size-4" />
          </span>
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
