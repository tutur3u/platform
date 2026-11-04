import type { EmailService } from '@tuturuuu/email-service';
import { describe, expect, it, vi } from 'vitest';
import { createEmailServiceMailer } from './mailer';

const input = {
  to: 'owner@example.com',
  subject: 'Subject',
  html: '<p>Body</p>',
  text: 'Body',
  noticeId: 'policy-change-2026-11-11',
  bypassUnsubscribe: false,
};

function mailerWith(result: unknown) {
  const sendInternal = vi.fn(async () => result);
  const service = { sendInternal } as unknown as EmailService;
  return {
    sendInternal,
    mailer: createEmailServiceMailer(async () => service),
  };
}

describe('EmailService mailer', () => {
  it('sends one multipart message to one recipient through sendInternal', async () => {
    const { mailer, sendInternal } = mailerWith({
      success: true,
      messageId: 'ses-1',
      deliveryOutcome: 'accepted',
    });

    expect(await mailer.send(input)).toEqual({
      kind: 'sent',
      messageId: 'ses-1',
    });
    expect(sendInternal).toHaveBeenCalledWith(
      {
        recipients: { to: ['owner@example.com'] },
        content: { subject: 'Subject', html: '<p>Body</p>', text: 'Body' },
        metadata: {
          wsId: '00000000-0000-0000-0000-000000000000',
          templateType: 'policy-notice',
          entityType: 'policy_notice',
          entityId: 'policy-change-2026-11-11',
          priority: 'high',
        },
      },
      { skipRecipientBlacklist: false }
    );
  });

  it('skips the blacklist check only when the bypass is requested', async () => {
    const { mailer, sendInternal } = mailerWith({
      success: true,
      messageId: 'ses-2',
    });
    await mailer.send({ ...input, bypassUnsubscribe: true });
    expect(sendInternal).toHaveBeenCalledWith(expect.anything(), {
      skipRecipientBlacklist: true,
    });
  });

  it.each([
    [
      {
        success: false,
        error: 'All recipients blocked',
        blockedRecipients: [{}],
      },
      { kind: 'blocked' },
    ],
    [{ success: false, deliveryOutcome: 'rejected' }, { kind: 'rejected' }],
    [{ success: false, deliveryOutcome: 'unknown' }, { kind: 'unknown' }],
    [
      { success: false, error: 'Supabase client not initialized' },
      { kind: 'unknown' },
    ],
    [{ success: true }, { kind: 'unknown' }],
  ])('maps %o to %o', async (result, expected) => {
    expect(await mailerWith(result).mailer.send(input)).toEqual(expected);
  });

  it('loads the email service once, on the first send', async () => {
    const service = {
      sendInternal: vi.fn(async () => ({ success: true, messageId: 'x' })),
    } as unknown as EmailService;
    const load = vi.fn(async () => service);
    const mailer = createEmailServiceMailer(load);
    expect(load).not.toHaveBeenCalled();
    await mailer.send(input);
    await mailer.send(input);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
