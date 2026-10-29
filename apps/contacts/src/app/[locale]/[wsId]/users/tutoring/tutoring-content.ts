import type { TutoringQueueItem } from '@tuturuuu/internal-api';
import type { MissedClassNotes } from '@tuturuuu/utils/tutoring-lesson-content';

// The server derives linked make-up content with the same rule.
export {
  getMissedClassNotes,
  getMissedLessonContent,
  getMissedLessonNotes,
} from '@tuturuuu/utils/tutoring-lesson-content';

/** Section headings used when one draft carries more than one kind of content. */
export interface QueueDraftLabels {
  absent: string;
  lessonNotes: string;
  posts: string;
  weak: string;
}

const section = (label: string, text: string) => `${label}:\n${text}`;

/** The missed class's session notes, then its posts; labelled when both exist. */
export function composeMissedClassText(
  notes: Pick<MissedClassNotes, 'content' | 'postContent'>,
  labels: Pick<QueueDraftLabels, 'lessonNotes' | 'posts'>
) {
  if (notes.content && notes.postContent)
    return [
      section(labels.lessonNotes, notes.content),
      section(labels.posts, notes.postContent),
    ].join('\n\n');
  return notes.content || notes.postContent;
}

/**
 * The Content a queue row drafts. Absent make-up teaches the class notes from
 * the missed day (kèm nghỉ); weak support teaches what the homeroom teacher
 * wrote when moving the learner into support (kèm yếu); a row with both reasons
 * carries both, labelled, so neither text is dropped.
 */
export function buildQueueDraftContent(
  item: Pick<TutoringQueueItem, 'reason_type' | 'feedback_content'>,
  notes: MissedClassNotes,
  labels: QueueDraftLabels
) {
  if (item.reason_type === 'WEAK_SUPPORT')
    return {
      content: item.feedback_content,
      // Weak content is the teacher's own text; nothing follows class notes.
      linkedContent: undefined,
      missingLessonDates: [] as string[],
    };
  const absentText = composeMissedClassText(notes, labels);
  if (item.reason_type === 'ABSENT_RECOVERY')
    return {
      content: absentText,
      // Only session notes can follow the class; a post is saved as written.
      linkedContent: notes.postContent ? undefined : notes.content,
      missingLessonDates: notes.missingDates,
    };
  // A combined text is saved as written: following the class notes alone would
  // drop the homeroom teacher's note.
  const sections = [
    { label: labels.absent, text: absentText },
    { label: labels.weak, text: item.feedback_content.trim() },
  ]
    .filter((part) => part.text)
    .map((part) => section(part.label, part.text));
  return {
    content: sections.join('\n\n'),
    linkedContent: undefined,
    missingLessonDates: notes.missingDates,
  };
}

/** What one created session drafts, and the class notes it follows if any. */
export interface QueueSlotDraft {
  content: string;
  linkedContent: string | undefined;
  /** The missed date the session teaches, when it is a make-up for one. */
  pairedMissedDate?: string;
}

/** Valid missed dates, oldest first: the order the server pairs them in. */
export function sortedMissedDates(dates: string[]) {
  return dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
}

/**
 * The Content each created session drafts. One session carries everything, as
 * `buildQueueDraftContent` does. With several, session `i` teaches missed date
 * `i` (oldest first); weak support repeats the homeroom teacher's note, and a
 * row with both reasons pairs each session's own missed-day text with that
 * note. A session beyond the missed dates drafts only what is not date-bound.
 */
export function buildQueueSlotDrafts(
  item: Pick<
    TutoringQueueItem,
    'reason_type' | 'feedback_content' | 'missed_class_dates'
  >,
  notes: MissedClassNotes,
  labels: QueueDraftLabels,
  count: number
): QueueSlotDraft[] {
  if (count <= 1) {
    const draft = buildQueueDraftContent(item, notes, labels);
    return [{ content: draft.content, linkedContent: draft.linkedContent }];
  }
  const dates = sortedMissedDates(item.missed_class_dates);
  const weakText = item.feedback_content.trim();
  return Array.from({ length: count }, (_, index) => {
    if (item.reason_type === 'WEAK_SUPPORT')
      return { content: item.feedback_content, linkedContent: undefined };
    const date = dates[index];
    const dayNotes = {
      content: (date && notes.contentByDate?.[date]) || '',
      postContent: (date && notes.postContentByDate?.[date]) || '',
    };
    const absentText = composeMissedClassText(dayNotes, labels);
    if (item.reason_type === 'ABSENT_RECOVERY')
      return {
        content: absentText,
        linkedContent: dayNotes.postContent ? undefined : dayNotes.content,
        pairedMissedDate: date,
      };
    const content = [
      { label: labels.absent, text: absentText },
      { label: labels.weak, text: weakText },
    ]
      .filter((part) => part.text)
      .map((part) => section(part.label, part.text))
      .join('\n\n');
    return { content, linkedContent: undefined };
  });
}
