'use client';

import { CloudAlert, CloudCheck, CloudUpload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { MailSyncState } from './use-mail-thread-actions';

export function MailSyncStatus({ state }: { state: MailSyncState }) {
  const t = useTranslations('mail');
  const syncing = state === 'syncing';
  const failed = state === 'failed';
  const Icon = failed ? CloudAlert : syncing ? CloudUpload : CloudCheck;
  const label = failed
    ? t('sync_failed')
    : syncing
      ? t('syncing')
      : t('synced');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('sync_status')}
          className={cn(failed && 'text-destructive')}
          size="icon"
          variant="ghost"
        >
          <Icon className={cn('size-4', syncing && 'animate-pulse')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-xl p-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]',
              failed && 'text-destructive'
            )}
          >
            <Icon className={cn('size-3.5', syncing && 'animate-pulse')} />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-sm">{label}</p>
            <p className="mt-0.5 text-muted-foreground text-xs leading-5">
              {failed ? t('sync_failed_description') : t('sync_description')}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
