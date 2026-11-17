import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  formatMailDetailDate,
  messageDeliveryRows,
  messageDetailLabelKey,
  messageHeaderRecipients,
  messagePeopleGroups,
  parseMailAddressList,
} from './message-details-model';

function message(overrides: Partial<MailMessageDetail> = {}) {
  return {
    fromAddress: 'tam@tuturuuu.com',
    fromName: 'Tam Nguyen',
    recipients: [],
    safeHeaders: {},
    receivedAt: '2026-11-17T03:52:07.000Z',
    sentAt: null,
    envelopeFrom: null,
    envelopeTo: null,
    observedRecipient: null,
    internetMessageId: null,
    inReplyTo: null,
    ...overrides,
  } as unknown as MailMessageDetail;
}

describe('messageDetailLabelKey', () => {
  it('maps lowercased safe headers to translation keys', () => {
    expect(messageDetailLabelKey('date')).toBe('date');
    expect(messageDetailLabelKey('reply-to')).toBe('reply_to');
    expect(messageDetailLabelKey('Message-ID')).toBe('message_id');
    expect(messageDetailLabelKey('in-reply-to')).toBe('in_reply_to');
    expect(messageDetailLabelKey('x-failed-recipients')).toBe(
      'failed_recipients'
    );
  });

  it('returns null for unknown headers and prototype keys', () => {
    expect(messageDetailLabelKey('x-mailer')).toBeNull();
    expect(messageDetailLabelKey('constructor')).toBeNull();
  });
});

describe('parseMailAddressList', () => {
  it('parses quoted names, bare addresses and commas inside quotes', () => {
    expect(
      parseMailAddressList(
        '"Vo, Phuc" <phuc@tuturuuu.com>, sam@tuturuuu.com, Team <TEAM@x.vn>, junk'
      )
    ).toEqual([
      { address: 'phuc@tuturuuu.com', name: 'Vo, Phuc' },
      { address: 'sam@tuturuuu.com', name: null },
      { address: 'TEAM@x.vn', name: 'Team' },
    ]);
  });

  it('deduplicates addresses case-insensitively', () => {
    expect(parseMailAddressList('a@x.com, A@X.com')).toHaveLength(1);
    expect(parseMailAddressList(null)).toEqual([]);
  });
});

describe('message people and delivery rows', () => {
  it('falls back to the delivery address when To is empty', () => {
    expect(
      messageHeaderRecipients(message({ observedRecipient: 'sales@x.vn' }))
    ).toEqual([{ address: 'sales@x.vn', name: null }]);
  });

  it('groups people and reads reply-to from the safe header', () => {
    const groups = messagePeopleGroups(
      message({
        recipients: [
          { kind: 'to', address: 'phuc@x.vn', displayName: 'Phuc' },
          { kind: 'to', address: 'PHUC@x.vn', displayName: null },
          { kind: 'cc', address: 'ketoan@x.vn', displayName: null },
        ],
        safeHeaders: { 'reply-to': 'Support <support@x.vn>' },
      })
    );
    expect(groups.map((group) => group.key)).toEqual([
      'from',
      'reply_to',
      'to',
      'cc',
    ]);
    expect(groups[2]?.people).toHaveLength(1);
  });

  it('labels known headers and keeps unknown safe headers raw', () => {
    const rows = messageDeliveryRows(
      message({
        envelopeFrom: 'bounce@amazonses.com',
        internetMessageId: '<id@mail>',
        safeHeaders: {
          date: 'Tue, 17 Nov 2026 03:52:07 +0000',
          subject: 'Hidden',
          'x-failed-recipients': 'a@x.vn',
          'x-custom': 'value',
        },
      })
    );
    expect(rows).toEqual([
      {
        kind: 'date',
        iso: '2026-11-17T03:52:07.000Z',
        raw: 'Tue, 17 Nov 2026 03:52:07 +0000',
      },
      {
        kind: 'text',
        header: 'mailed-by',
        label: 'mailed_by',
        value: 'amazonses.com',
      },
      { kind: 'id', key: 'message_id', value: '<id@mail>' },
      {
        kind: 'text',
        header: 'x-failed-recipients',
        label: 'failed_recipients',
        value: 'a@x.vn',
      },
      { kind: 'text', header: 'x-custom', label: null, value: 'value' },
    ]);
  });
});

describe('formatMailDetailDate', () => {
  it('formats local time with the zone', () => {
    const value = formatMailDetailDate(
      '2026-11-17T03:52:07.000Z',
      'en-US',
      'Asia/Ho_Chi_Minh'
    );
    expect(value).toContain('Tue');
    expect(value).toContain('Nov 17, 2026');
    expect(value).toContain('10:52');
    expect(value).toContain('GMT+7');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatMailDetailDate(null, 'en-US')).toBe('');
    expect(formatMailDetailDate('not a date', 'en-US')).toBe('');
  });
});
