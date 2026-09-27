import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import type { Json } from '@tuturuuu/types';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';

function localDate(session: WorkspaceUserGroupSession) {
  if (session.recurrenceInstanceDate) return session.recurrenceInstanceDate;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone: session.startTimezone,
      year: 'numeric',
    }).formatToParts(new Date(session.startsAt));
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return null;
  }
}

/** Draft make-up content from the recorded lesson on each missed class date. */
export function getMissedLessonContent(
  sessions: WorkspaceUserGroupSession[],
  missedDates: string[]
) {
  const missed = new Set(missedDates);
  return sessions
    .filter((session) => session.status === 'scheduled')
    .map((session) => {
      const date = localDate(session);
      if (!date || !missed.has(date)) return null;
      const richText = session.descriptionJson
        ? getDescriptionText(session.descriptionJson as Json).trim()
        : '';
      const content = richText || session.description?.trim();
      return content ? { date, content } : null;
    })
    .filter((item): item is { date: string; content: string } => Boolean(item))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, content }) => `${date}: ${content}`)
    .join('\n');
}
