'use client';
import { Loader2, PhoneOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The closed room's identity card: title, meeting name, facts, one primary
 * and at most one secondary action, a quiet overflow menu and, on phones,
 * the open notes reader.
 */
export function EndedSummaryCard({
  meetingName,
  title,
  hint,
  facts,
  saving,
  actions,
  more,
  reader,
}: {
  meetingName: string;
  title: string;
  hint?: string;
  facts?: ReactNode;
  saving: boolean;
  /** One primary action, then at most one secondary. */
  actions: ReactNode;
  /** The quiet overflow menu under the actions. */
  more?: ReactNode;
  /** Phone layout only: the open reader inside the card. */
  reader?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  return (
    <section
      aria-labelledby="meet-ended-title"
      className="grid w-full justify-items-center gap-6 rounded-3xl border bg-card px-5 py-8 text-center text-card-foreground shadow-sm sm:px-7"
    >
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <PhoneOff aria-hidden="true" className="size-5" />
      </span>
      <div className="grid max-w-full gap-1.5">
        <h1
          id="meet-ended-title"
          className="text-balance font-semibold text-2xl tracking-tight"
        >
          {title}
        </h1>
        <p className="break-words text-muted-foreground text-sm">
          {meetingName}
        </p>
        {hint && (
          <p className="text-pretty text-muted-foreground text-sm">{hint}</p>
        )}
      </div>
      {facts}
      {saving && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 text-sm"
        >
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          {t('saving_notes')}
        </p>
      )}
      <div className="grid w-full gap-2">{actions}</div>
      {reader}
      {more && <div className="flex justify-center">{more}</div>}
    </section>
  );
}
