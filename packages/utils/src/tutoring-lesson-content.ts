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

/** How many days after a lesson its report may still be written. */
export const POST_LESSON_WINDOW_DAYS = 2;

function daysBetween(from: string, to: string) {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

interface LessonStart {
  date: string;
  startsAt: number;
}

/**
 * The lesson a post reports on: the latest scheduled class session that had
 * started by the time the post was written, within `POST_LESSON_WINDOW_DAYS`
 * of its created date; otherwise the created date itself. A report written the
 * next morning, before that day's lesson starts, belongs to the previous one.
 */
function postLessonDate(
  createdAt: string,
  created: string,
  lessons: LessonStart[]
) {
  const writtenAt = Date.parse(createdAt);
  let best: LessonStart | null = null;
  for (const lesson of lessons) {
    if (lesson.startsAt > writtenAt) continue;
    if (daysBetween(lesson.date, created) > POST_LESSON_WINDOW_DAYS) continue;
    if (!best || lesson.startsAt > best.startsAt) best = lesson;
  }
  return best?.date ?? created;
}

/**
 * Posts have no lesson date, so a post belongs to the lesson it reports on
 * (see `postLessonDate`), with dates read in `timeZone` (the class's own
 * zone). `missingDates` lists missed dates with neither session notes nor a
 * post.
 */
export function getMissedClassNotes(
  sessions: TutoringLessonNoteSession[],
  posts: TutoringClassPost[],
  missedDates: string[],
  timeZone: string
): MissedClassNotes {
  const lessons = getMissedLessonNotes(sessions, missedDates);
  const missed = new Set(missedDates);
  const lessonStarts = sessions
    .filter((session) => session.status === 'scheduled')
    .map((session) => ({
      date: localDate(session),
      startsAt: Date.parse(session.startsAt),
    }))
    .filter((item): item is LessonStart =>
      Boolean(item.date && Number.isFinite(item.startsAt))
    );
  const entries = posts
    .map((post) => {
      const created = zonedDate(post.createdAt, timeZone);
      const date =
        created && postLessonDate(post.createdAt, created, lessonStarts);
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

/** Section headings for a make-up drafted from both kinds of class notes. */
export interface MissedClassLabels {
  lessonNotes: string;
  posts: string;
}

/** The Vietnamese headings the queue draft uses; the server composes with them. */
export const MISSED_CLASS_LABELS_VI: MissedClassLabels = {
  lessonNotes: 'Ghi chú buổi học',
  posts: 'Bài viết của lớp',
};

const section = (label: string, text: string) => `${label}:\n${text}`;

/** The missed class's session notes, then its posts; labelled when both exist. */
export function composeMissedClassText(
  notes: Pick<MissedClassNotes, 'content' | 'postContent'>,
  labels: MissedClassLabels
) {
  if (notes.content && notes.postContent)
    return [
      section(labels.lessonNotes, notes.content),
      section(labels.posts, notes.postContent),
    ].join('\n\n');
  return notes.content || notes.postContent;
}
