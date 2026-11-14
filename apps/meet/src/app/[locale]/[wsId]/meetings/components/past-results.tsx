'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MeetingRow } from './meeting-row';
import type { MeetingManagement, PastResults, ScheduledMeeting } from './types';

export function PastResultsBody({
  results,
  meetings,
  narrowed,
  onClear,
  onLoadOlder,
  onRetry,
  clearLabel,
  retryLabel,
  accountId,
  wsId,
  timeZone,
  management,
}: {
  results: PastResults;
  meetings: ScheduledMeeting[];
  narrowed: boolean;
  onClear: () => void;
  onLoadOlder: () => void;
  onRetry: () => void;
  clearLabel: string;
  retryLabel: string;
  accountId: string;
  wsId: string;
  timeZone: string | undefined;
  management: MeetingManagement;
}) {
  const t = useTranslations('meet.meetings');
  switch (results.kind) {
    case 'loading':
      return (
        <div aria-busy className="space-y-3 px-4 py-4 md:px-5">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      );
    case 'error':
      return (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm md:px-5"
          role="alert"
        >
          {t('load_failed')}
          <Button onClick={onRetry} size="sm" variant="outline">
            {retryLabel}
          </Button>
        </div>
      );
    case 'ready':
      if (meetings.length === 0)
        return (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-muted-foreground text-sm md:px-5">
            {narrowed ? t('past_no_results') : t('past_empty')}
            {narrowed && (
              <Button onClick={onClear} size="sm" variant="ghost">
                {clearLabel}
              </Button>
            )}
          </div>
        );
      return (
        <>
          <ul className="divide-y">
            {meetings.map((meeting) => (
              <MeetingRow
                accountId={accountId}
                key={meeting.id}
                management={management}
                meeting={meeting}
                timeZone={timeZone}
                withDate
                wsId={wsId}
              />
            ))}
          </ul>
          <OlderFooter older={results.older} onLoadOlder={onLoadOlder} />
        </>
      );
    default: {
      const unreachable: never = results;
      return unreachable;
    }
  }
}

function OlderFooter({
  older,
  onLoadOlder,
}: {
  older: Extract<PastResults, { kind: 'ready' }>['older'];
  onLoadOlder: () => void;
}) {
  const t = useTranslations('meet.meetings');
  if (older.kind === 'complete') return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t px-4 py-2 text-muted-foreground text-sm">
      {older.kind === 'failed' && (
        <span role="alert">{t('load_older_failed')}</span>
      )}
      <Button
        disabled={older.kind === 'loading'}
        onClick={onLoadOlder}
        size="sm"
        variant="ghost"
      >
        {older.kind === 'loading' ? t('loading_older') : t('load_older')}
      </Button>
    </div>
  );
}
