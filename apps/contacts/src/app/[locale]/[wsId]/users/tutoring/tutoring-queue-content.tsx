'use client';

import type { TutoringQueueItem } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { composeMissedClassText } from './tutoring-content';

type QueueContentItem = Pick<
  TutoringQueueItem,
  | 'feedback_content'
  | 'missed_lesson_content'
  | 'missed_post_content'
  | 'missing_lesson_dates'
  | 'reason_type'
>;

/**
 * What the tutor will teach for a queue row: the missed lesson's notes for an
 * absence (kèm nghỉ), the homeroom teacher's note for weak support (kèm yếu),
 * and both, labelled, for a row with both reasons.
 */
export function TutoringQueueContent({ item }: { item: QueueContentItem }) {
  const t = useTranslations('ws-tutoring');
  const hasAbsent = item.reason_type !== 'WEAK_SUPPORT';
  const hasWeak = item.reason_type !== 'ABSENT_RECOVERY';
  const missing = item.missing_lesson_dates ?? [];
  const lessonText = composeMissedClassText(
    {
      content: item.missed_lesson_content?.trim() ?? '',
      postContent: item.missed_post_content?.trim() ?? '',
    },
    {
      lessonNotes: t('content_label_lesson_notes'),
      posts: t('content_label_posts'),
    }
  );
  const both = hasAbsent && hasWeak;

  const absentSection = hasAbsent ? (
    <div className="space-y-0.5">
      {both ? (
        <p className="font-medium text-muted-foreground text-xs">
          {t('content_section_absent')}
        </p>
      ) : null}
      {lessonText ? (
        <p className="line-clamp-3 whitespace-pre-line text-sm">{lessonText}</p>
      ) : null}
      {missing.length ? (
        <p className="text-dynamic-orange text-xs">
          {t('lesson_notes_missing', { dates: missing.join(', ') })}
        </p>
      ) : null}
      {!(lessonText || missing.length) && !both ? (
        <p className="text-sm">-</p>
      ) : null}
    </div>
  ) : null;

  const weakSection = hasWeak ? (
    <div className="space-y-0.5">
      {both ? (
        <p className="font-medium text-muted-foreground text-xs">
          {t('content_section_weak')}
        </p>
      ) : null}
      <p className="line-clamp-2 text-sm">{item.feedback_content || '-'}</p>
    </div>
  ) : null;

  return (
    <div className="space-y-1.5">
      {absentSection}
      {weakSection}
    </div>
  );
}
