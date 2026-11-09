'use client';
import { ArrowUpRight, Clock, MapPin, Video } from '@tuturuuu/icons';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import type { ArtifactRow } from './mira-artifact-data';

/** Compact agenda styling shared with the calendar app's date/color hierarchy. */
export function MiraScheduleCard({
  row,
  meetings,
  href,
  timeZone,
}: {
  row: ArtifactRow;
  meetings: boolean;
  href?: string;
  timeZone: string;
}) {
  const t = useTranslations('dashboard.mira_workspace');
  const format = useFormatter();
  const date = new Date(row.date!);
  const colors = getEventStyles(row.color || (meetings ? 'purple' : 'blue'));
  const time = (value: string) =>
    format.dateTime(new Date(value), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
  return (
    <li
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-l-[3px] bg-card transition-colors hover:bg-muted/30',
        colors.border
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5 p-2.5">
        {meetings && (
          <div className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-dynamic-purple/10 py-1 text-dynamic-purple">
            <span className="text-[9px] uppercase">
              {format.dateTime(date, { month: 'short', timeZone })}
            </span>
            <span className="font-semibold text-lg leading-tight">
              {format.dateTime(date, { day: 'numeric', timeZone })}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 font-medium text-xs leading-relaxed [overflow-wrap:anywhere]">
              {meetings && href ? (
                <a
                  href={`${href}/${encodeURIComponent(row.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {row.title}
                </a>
              ) : (
                row.title
              )}
            </p>
            {meetings && href && (
              <a
                aria-label={t('open_meeting', { name: row.title })}
                href={`${href}/${encodeURIComponent(row.id)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border p-1.5 text-dynamic-purple hover:bg-dynamic-purple/10"
              >
                <ArrowUpRight className="size-3.5" />
              </a>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center gap-1 whitespace-nowrap tabular-nums',
                colors.text
              )}
            >
              <Clock className="size-3 shrink-0" />
              <time dateTime={row.date}>
                {row.allDay ? t('all_day') : time(row.date!)}
              </time>
              {row.endDate && !row.allDay && (
                <>
                  <span aria-hidden>–</span>
                  <time dateTime={row.endDate}>{time(row.endDate)}</time>
                </>
              )}
            </span>
            {meetings && (
              <span className="inline-flex items-center gap-1">
                <Video className="size-3" />
                {t('meetings')}
              </span>
            )}
          </div>
          {row.detail && (
            <p className="flex min-w-0 items-start gap-1 text-[11px] text-muted-foreground">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {row.detail}
              </span>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
