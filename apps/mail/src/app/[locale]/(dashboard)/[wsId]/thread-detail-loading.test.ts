// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { ThreadDetail } from './thread-detail';

afterEach(cleanup);
describe('reader actions while loading the next body', () => {
  it('keeps the selected summary archive action enabled while the body is loading', () => {
    const onArchive = vi.fn();
    render(
      createElement(ThreadDetail, {
        summary: {
          id: 'next',
          subject: 'Next email',
          messageCount: 1,
          starred: true,
        } as MailThreadSummary,
        thread: null,
        loading: true,
        isDraft: false,
        actionPending: false,
        onArchive,
        onBack: vi.fn(),
        onForward: vi.fn(),
        onReply: vi.fn(),
        onReplyAll: vi.fn(),
        onStar: vi.fn(),
        onTrash: vi.fn(),
      })
    );
    expect(screen.getByRole('heading', { name: 'Next email' })).toBeTruthy();
    const archive = screen.getByRole('button', {
      name: 'archive',
    }) as HTMLButtonElement;
    expect(archive.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'unstar' })).toBeTruthy();
    fireEvent.click(archive);
    expect(onArchive).toHaveBeenCalledOnce();
    expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy();
  });
});

it('does not show a misleading retry-backed compose action when no message is selected', () => {
  const onRetry = vi.fn();
  render(
    createElement(ThreadDetail, {
      thread: null,
      loading: false,
      isDraft: false,
      actionPending: false,
      onRetry,
      onArchive: vi.fn(),
      onBack: vi.fn(),
      onForward: vi.fn(),
      onReply: vi.fn(),
      onReplyAll: vi.fn(),
      onStar: vi.fn(),
      onTrash: vi.fn(),
    })
  );
  expect(screen.queryByRole('button', { name: 'compose' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'retry' })).toBeNull();
});
