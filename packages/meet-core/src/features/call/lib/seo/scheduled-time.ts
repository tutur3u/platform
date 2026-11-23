import { MEET_SEO_COPY, type MeetSeoLocale } from './copy';

/**
 * Link crawlers have no recipient timezone, so the schedule is always shown in
 * UTC. Formatting is hand-rolled to stay identical across runtimes.
 */
export function formatMeetScheduledTime(
  scheduledAt: string,
  locale: MeetSeoLocale
): string | null {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return null;
  const copy = MEET_SEO_COPY[locale];
  const day = date.getUTCDate();
  const month = copy.months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes()
  ).padStart(2, '0')}`;
  return copy.scheduledFormat
    .replace('{date}', `${day} ${month} ${year}`)
    .replace('{time}', time);
}
