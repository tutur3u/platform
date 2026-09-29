import type { SendMailMessagePayload } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  createMailDraft: vi.fn(),
  getMailMessage: vi.fn(),
  requireMailboxAccess: vi.fn(),
  updateMailDraft: vi.fn(),
}));

vi.mock('./bootstrap', () => ({
  requireMailboxAccess: mocks.requireMailboxAccess,
}));
vi.mock('./drafts', () => ({
  createMailDraft: mocks.createMailDraft,
  updateMailDraft: mocks.updateMailDraft,
}));
vi.mock('./messages', () => ({ getMailMessage: mocks.getMailMessage }));

describe('sendMailMessage replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the previously sent message for the client ID', async () => {
    mocks.requireMailboxAccess.mockResolvedValue({ mailbox: {} });
    const previous = {
      id: '12e8cc40-1b85-477d-94a6-6a13f9aa6151',
      status: 'sent',
    };
    mocks.getMailMessage.mockResolvedValue(previous);
    const { sendMailMessage } = await import('./send');

    const result = await sendMailMessage({
      ctx: {} as MailRouteContext,
      mailboxId: 'mailbox',
      payload: {
        clientMessageId: previous.id,
        subject: 'Hello',
        to: ['person@example.com'],
      } as SendMailMessagePayload,
    });

    expect(result).toBe(previous);
    expect(mocks.createMailDraft).not.toHaveBeenCalled();
  });

  it('does not enqueue delivery if another send wins the race', async () => {
    mocks.requireMailboxAccess.mockResolvedValue({ mailbox: {} });
    mocks.getMailMessage.mockResolvedValue(null);
    const previous = { id: 'message', status: 'sent' };
    mocks.createMailDraft.mockResolvedValue(previous);
    const { sendMailMessage } = await import('./send');

    const result = await sendMailMessage({
      ctx: {} as MailRouteContext,
      mailboxId: 'mailbox',
      payload: {
        clientMessageId: '12e8cc40-1b85-477d-94a6-6a13f9aa6151',
        subject: 'Hello',
        to: ['person@example.com'],
      } as SendMailMessagePayload,
    });

    expect(result).toBe(previous);
    expect(mocks.createMailDraft).toHaveBeenCalledOnce();
  });
});
