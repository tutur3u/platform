'use client';

import { Clock3, Loader2, ShieldCheck, TriangleAlert } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useWaitDeadline } from '../hooks/use-wait-deadline';

export const ADMISSION_WAIT_NOTICE_MS = 60_000;

export function AdmissionNotice({
  waiting,
  connecting,
  error,
}: {
  waiting: boolean;
  connecting: boolean;
  error?: string | null;
}) {
  const t = useTranslations('meet.call');
  const longWait = useWaitDeadline(waiting, ADMISSION_WAIT_NOTICE_MS);
  const Icon = error
    ? TriangleAlert
    : waiting
      ? Clock3
      : connecting
        ? Loader2
        : ShieldCheck;
  return (
    <output
      aria-live="polite"
      className="mt-5 flex gap-3 rounded-xl border bg-muted/30 p-4"
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 size-5 shrink-0 text-primary ${connecting && !waiting && !error ? 'motion-safe:animate-spin' : ''}`}
      />
      <div className="space-y-1">
        <p className="font-medium text-sm">
          {t(
            error
              ? 'join_error_title'
              : waiting
                ? 'waiting_for_host'
                : connecting
                  ? 'connecting'
                  : 'join_admitted_title'
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          {error ??
            t(
              waiting
                ? 'waiting_explanation'
                : connecting
                  ? 'join_connecting_hint'
                  : 'join_admitted_hint'
            )}
        </p>
        {waiting && !error && longWait && (
          <p className="text-muted-foreground text-sm">{t('join_wait_long')}</p>
        )}
      </div>
    </output>
  );
}
