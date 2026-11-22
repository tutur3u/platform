'use client';
import { Loader2, PhoneOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The closed room's identity card: meeting name, status, facts, the primary
 * and Back actions, a quiet row of secondary actions and, on phones, the
 * open notes reader.
 */
export function EndedSummaryCard({
  meetingName,
  title,
  hint,
  facts,
  saving,
  actions,
  secondary,
  reader,
}: {
  meetingName: string;
  title: string;
  hint?: string;
  facts?: ReactNode;
  saving: boolean;
  /** Primary action first, then Back to Meet. */
  actions: ReactNode;
  /** Quiet ghost actions under a divider; omitted when empty. */
  secondary?: ReactNode;
  /** Phone layout only: the open reader inside the card. */
  reader?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  return (
    <section
      aria-labelledby="meet-ended-title"
      className="grid w-full justify-items-center gap-5 rounded-3xl border bg-card px-5 py-7 text-center text-card-foreground shadow-sm sm:px-7"
    >
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <PhoneOff aria-hidden="true" className="size-5" />
      </span>
      <div className="grid max-w-full gap-1.5">
        <p className="break-words font-semibold text-muted-foreground text-sm">
          {meetingName}
        </p>
        <h1
          id="meet-ended-title"
          className="text-balance font-semibold text-2xl tracking-tight"
        >
          {title}
        </h1>
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
      {secondary && (
        <div className="flex w-full flex-wrap items-center justify-center gap-1 border-t pt-4">
          {secondary}
        </div>
      )}
    </section>
  );
}
