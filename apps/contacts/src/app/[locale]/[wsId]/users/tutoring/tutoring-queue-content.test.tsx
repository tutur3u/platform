// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TutoringQueueContent } from './tutoring-queue-content';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { dates: string }) =>
    values ? `${key}:${values.dates}` : key,
}));

afterEach(cleanup);

const base = {
  feedback_content: '',
  missed_lesson_content: '',
  missed_post_content: '',
  missing_lesson_dates: [] as string[],
};

describe('queue tutoring content', () => {
  it('shows the missed lesson notes for an absent item', () => {
    render(
      <TutoringQueueContent
        item={{
          ...base,
          reason_type: 'ABSENT_RECOVERY',
          missed_lesson_content: '2026-10-22: Unit 3 food',
        }}
      />
    );
    expect(screen.getByText('2026-10-22: Unit 3 food')).toBeInTheDocument();
    expect(screen.queryByText(/lesson_notes_missing/)).not.toBeInTheDocument();
  });

  it('hints at the dates with no recorded notes instead of staying empty', () => {
    render(
      <TutoringQueueContent
        item={{
          ...base,
          reason_type: 'ABSENT_RECOVERY',
          missing_lesson_dates: ['2026-10-22'],
        }}
      />
    );
    expect(
      screen.getByText('lesson_notes_missing:2026-10-22')
    ).toBeInTheDocument();
  });

  it('labels session notes and posts when both exist', () => {
    render(
      <TutoringQueueContent
        item={{
          ...base,
          reason_type: 'ABSENT_RECOVERY',
          missed_lesson_content: '2026-10-22: Unit 3',
          missed_post_content: '2026-10-22: Bài 5',
        }}
      />
    );
    expect(screen.getByText(/content_label_posts/)).toHaveTextContent(
      /content_label_lesson_notes:\s*2026-10-22: Unit 3\s*content_label_posts:\s*2026-10-22: Bài 5/
    );
  });

  it('shows both sections, labelled, for an absent and weak item', () => {
    render(
      <TutoringQueueContent
        item={{
          ...base,
          reason_type: 'BOTH',
          feedback_content: 'Homeroom note',
          missed_lesson_content: '2026-10-22: Unit 3 food',
        }}
      />
    );
    expect(screen.getByText('content_section_absent')).toBeInTheDocument();
    expect(screen.getByText('2026-10-22: Unit 3 food')).toBeInTheDocument();
    expect(screen.getByText('content_section_weak')).toBeInTheDocument();
    expect(screen.getByText('Homeroom note')).toBeInTheDocument();
  });

  it('shows only the homeroom note for a weak item', () => {
    render(
      <TutoringQueueContent
        item={{
          ...base,
          reason_type: 'WEAK_SUPPORT',
          feedback_content: 'Homeroom note',
        }}
      />
    );
    expect(screen.getByText('Homeroom note')).toBeInTheDocument();
    expect(screen.queryByText('content_section_weak')).not.toBeInTheDocument();
  });
});
