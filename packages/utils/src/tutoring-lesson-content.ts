import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import type { Json } from '@tuturuuu/types';
import { getDescriptionText } from './text-helper';

/** The class-session fields that carry a lesson's recorded notes. */
export type TutoringLessonNoteSession = Pick<
  WorkspaceUserGroupSession,
  | 'description'
  | 'descriptionJson'
  | 'recurrenceInstanceDate'
  | 'startTimezone'
  | 'startsAt'
  | 'status'
>;

function zonedDate(timestamp: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(new Date(timestamp));
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return null;
  }
}

function localDate(session: TutoringLessonNoteSession) {
  if (session.recurrenceInstanceDate) return session.recurrenceInstanceDate;
  return zonedDate(session.startsAt, session.startTimezone);
}

function groupLinesByDate(entries: { date: string; line: string }[]) {
  const byDate: Record<string, string> = {};
  for (const { date, line } of entries)
    byDate[date] = byDate[date] ? `${byDate[date]}\n${line}` : line;
  return byDate;
}

/** The recorded notes for missed class dates, and the dates without any. */
export interface MissedLessonNotes {
  /** `YYYY-MM-DD: notes`, one line per date that has notes. */
  content: string;
  /** Missed dates with no notes recorded on a scheduled class session. */
  missingDates: string[];
  /** The same `YYYY-MM-DD: notes` text split per date, for one session each. */
  contentByDate?: Record<string, string>;
}

/** Draft make-up content from the recorded lesson on each missed class date. */
export function getMissedLessonNotes(
  sessions: TutoringLessonNoteSession[],
  missedDates: string[]
): MissedLessonNotes {
  const missed = new Set(missedDates);
  const entries = sessions
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
    .sort((a, b) => a.date.localeCompare(b.date));
  const noted = new Set(entries.map((entry) => entry.date));
  return {
    content: entries
      .map(({ date, content }) => `${date}: ${content}`)
      .join('\n'),
    contentByDate: groupLinesByDate(
      entries.map(({ date, content }) => ({
        date,
        line: `${date}: ${content}`,
      }))
    ),
    missingDates: [...missed].filter((date) => !noted.has(date)).sort(),
  };
}

/** Draft make-up content from the recorded lesson on each missed class date. */
export function getMissedLessonContent(
  sessions: TutoringLessonNoteSession[],
  missedDates: string[]
) {
  return getMissedLessonNotes(sessions, missedDates).content;
}

/** The group-post fields that carry a class's written-up lesson. */
export interface TutoringClassPost {
  content: string | null;
  createdAt: string;
  title: string | null;
}

/** Class notes for missed dates from both sources, kept apart for labelling. */
export interface MissedClassNotes extends MissedLessonNotes {
  /** `YYYY-MM-DD: title` and body, one block per class post on a missed date. */
  postContent: string;
  /** The same post text split per date, for one session each. */
  postContentByDate?: Record<string, string>;
}

/**
 * Posts have no date of their own, so a post belongs to the missed date it was
 * created on, read in `timeZone` (the class's own zone). `missingDates` lists
 * missed dates with neither session notes nor a post.
 */
export function getMissedClassNotes(
  sessions: TutoringLessonNoteSession[],
  posts: TutoringClassPost[],
  missedDates: string[],
  timeZone: string
): MissedClassNotes {
  const lessons = getMissedLessonNotes(sessions, missedDates);
  const missed = new Set(missedDates);
  const entries = posts
    .map((post) => {
      const date = zonedDate(post.createdAt, timeZone);
      if (!date || !missed.has(date)) return null;
      const text = [post.title?.trim(), post.content?.trim()]
        .filter(Boolean)
        .join('\n');
      return text ? { createdAt: post.createdAt, date, text } : null;
    })
    .filter((item): item is { createdAt: string; date: string; text: string } =>
      Boolean(item)
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    );
  const withPosts = new Set(entries.map((entry) => entry.date));
  return {
    content: lessons.content,
    contentByDate: lessons.contentByDate,
    postContent: entries.map(({ date, text }) => `${date}: ${text}`).join('\n'),
    postContentByDate: groupLinesByDate(
      entries.map(({ date, text }) => ({ date, line: `${date}: ${text}` }))
    ),
    missingDates: lessons.missingDates.filter((date) => !withPosts.has(date)),
  };
}
