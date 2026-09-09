import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  formatMailRecipients,
  formatMailSender,
} from './mail-message-addresses';

const message = {
  fromName: ' Sender ',
  fromAddress: 'sender@example.com',
  recipients: [],
  observedRecipient: ' contact@example.com ',
  envelopeTo: 'catchall@example.com',
} as unknown as MailMessageDetail;
describe('mail participants', () => {
  it('uses recorded catch-all delivery when To is missing without inventing Cc or Bcc', () => {
    expect(formatMailRecipients(message, 'to')).toBe('contact@example.com');
    expect(formatMailRecipients(message, 'cc')).toBe('');
    expect(formatMailRecipients(message, 'bcc')).toBe('');
  });
  it('preserves parsed recipients and full names', () => {
    expect(formatMailSender(message)).toBe('Sender <sender@example.com>');
    expect(
      formatMailRecipients(
        {
          ...message,
          recipients: [
            { kind: 'to', address: 'to@example.com', displayName: 'Recipient' },
          ],
        },
        'to'
      )
    ).toBe('Recipient <to@example.com>');
  });
  it('falls back to envelope delivery and leaves unknown recipients empty', () => {
    expect(
      formatMailRecipients({ ...message, observedRecipient: ' ' }, 'to')
    ).toBe('catchall@example.com');
    expect(
      formatMailRecipients(
        { ...message, observedRecipient: null, envelopeTo: null },
        'to'
      )
    ).toBe('');
  });
});
