import { expect, it } from 'vitest';
import { getFailedMailRecipients } from './failed-recipients';

const subject = 'Delivery Status Notification (Failure)';
it('extracts the failed recipient from the delivery notice shown in Mail', () => {
  expect(
    getFailedMailRecipients({
      subject,
      bodyText:
        'An error occurred while trying to deliver the mail to the following recipients:\nfailed@example.com',
    })
  ).toEqual(['failed@example.com']);
});
it('extracts and deduplicates DSN recipients without including original-message addresses', () => {
  expect(
    getFailedMailRecipients({
      subject,
      bodyText:
        'Final-Recipient: rfc822; Failed@Example.com\nAction: failed\n\n-----Original message-----\nFrom: unrelated@example.com\nTo: failed@example.com',
      safeHeaders: { 'X-Failed-Recipients': 'failed@example.com' },
    })
  ).toEqual(['failed@example.com']);
});
it('does not offer blacklisting for ordinary mail or delayed deliveries', () => {
  expect(
    getFailedMailRecipients({
      subject: 'Newsletter',
      bodyText: 'Contact help@example.com',
    })
  ).toEqual([]);
  expect(
    getFailedMailRecipients({
      subject: 'Delivery Status Notification (Delay)',
      bodyText: 'Final-Recipient: rfc822; working@example.com\nAction: delayed',
    })
  ).toEqual([]);
});
it('excludes quoted headers after the recipient block', () => {
  expect(
    getFailedMailRecipients({
      subject,
      bodyText:
        'following recipients:\nfailed@example.com\nFrom: innocent@example.com\nTo: another@example.com',
    })
  ).toEqual(['failed@example.com']);
});
