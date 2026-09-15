import { expect, it } from 'vitest';
import {
  getFailedMailRecipients,
  isMailDeliveryFailure,
} from './failed-recipients';

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

it('suggests only failed recipients from mixed DSN outcomes', () => {
  expect(
    getFailedMailRecipients({
      subject,
      bodyText:
        'Final-Recipient: rfc822; failed@example.com\nAction: failed\nStatus: 5.1.1\n\nFinal-Recipient: rfc822; delivered@example.com\nAction: delivered\nStatus: 2.0.0\n\nFinal-Recipient: rfc822; delayed@example.com\nAction: delayed\nStatus: 4.0.0',
    })
  ).toEqual(['failed@example.com']);
});
it('does not suggest support contacts beneath a failed recipient', () => {
  expect(
    getFailedMailRecipients({
      subject,
      bodyText:
        'following recipients:\nfailed@example.com\nFor assistance contact support@example.com',
    })
  ).toEqual(['failed@example.com']);
});

it('recognizes Exchange failure subjects and affected-recipient wording', () => {
  expect(
    getFailedMailRecipients({
      subject: 'Delivery has failed to these recipients or groups',
      bodyText:
        'The following recipients or groups were affected:\nfailed@example.com',
    })
  ).toEqual(['failed@example.com']);
});
it('checks full-message eligibility even when the list preview omits recipients', () => {
  expect(
    isMailDeliveryFailure(
      subject,
      'A long explanation without recipient addresses'
    )
  ).toBe(true);
  expect(
    getFailedMailRecipients({
      subject,
      bodyText: '',
      safeHeaders: { 'x-failed-recipients': 'failed@example.com' },
    })
  ).toEqual(['failed@example.com']);
});
