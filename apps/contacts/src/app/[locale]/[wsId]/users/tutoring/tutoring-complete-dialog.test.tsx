// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

import {
  needsCompletionReview,
  TutoringCompleteDialog,
} from './tutoring-complete-dialog';

const withPosts =
  'Ghi chú buổi học:\n2026-10-22: Unit 3\n\nBài viết của lớp:\n2026-10-22: Daily report';

function session(overrides: Partial<TutoringSessionRecord> = {}) {
  return {
    attendance_status: 'PENDING',
    content: withPosts,
    content_linked: true,
    id: 'session-1',
    ...overrides,
  } as TutoringSessionRecord;
}

describe('TutoringCompleteDialog', () => {
  it('asks only for pending make-ups that still follow the class', () => {
    expect(needsCompletionReview(session())).toBe(true);
    expect(needsCompletionReview(session({ content_linked: false }))).toBe(
      false
    );
    expect(needsCompletionReview(session({ content: '  ' }))).toBe(false);
    expect(needsCompletionReview(session({ attendance_status: 'DONE' }))).toBe(
      false
    );
  });

  it('shows the exact text to save and saves the edited text', () => {
    const onComplete = vi.fn();
    render(
      <TutoringCompleteDialog
        isSaving={false}
        onComplete={onComplete}
        onOpenChange={vi.fn()}
        session={session()}
      />
    );

    const field = screen.getByLabelText('ws-tutoring.content');
    expect(field).toHaveProperty('value', withPosts);

    const notesOnly = 'Ghi chú buổi học:\n2026-10-22: Unit 3';
    fireEvent.change(field, { target: { value: notesOnly } });
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-tutoring.mark_done' })
    );

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
      notesOnly
    );
  });

  it('passes blank text through when the completer removes it all', () => {
    const onComplete = vi.fn();
    render(
      <TutoringCompleteDialog
        isSaving={false}
        onComplete={onComplete}
        onOpenChange={vi.fn()}
        session={session()}
      />
    );

    fireEvent.change(screen.getByLabelText('ws-tutoring.content'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-tutoring.mark_done' })
    );
    expect(onComplete).toHaveBeenCalledWith(expect.anything(), '');
  });
});
