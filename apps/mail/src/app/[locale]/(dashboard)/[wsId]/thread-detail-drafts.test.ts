// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MailThreadDetail } from '@tuturuuu/internal-api';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreadDetail } from './thread-detail';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./thread-message-card', () => ({ ThreadMessageCard: () => null }));
afterEach(cleanup);
it('edits the saved draft even when a received message is newer', () => {
  const draft = { id: 'draft', status: 'draft', attachments: [] };
  const received = { id: 'received', status: 'received', attachments: [] };
  const onEditDraft = vi.fn();
  render(
    createElement(ThreadDetail, {
      thread: {
        thread: { id: 'thread', subject: 'Report' },
        messages: [draft, received],
      } as unknown as MailThreadDetail,
      isDraft: true,
      loading: false,
      actionPending: false,
      onEditDraft,
      onArchive: vi.fn(),
      onBack: vi.fn(),
      onForward: vi.fn(),
      onReply: vi.fn(),
      onReplyAll: vi.fn(),
      onStar: vi.fn(),
      onTrash: vi.fn(),
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'edit_draft' }));
  expect(onEditDraft).toHaveBeenCalledWith(draft);
});
