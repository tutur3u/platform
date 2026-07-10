import { describe, expect, it } from 'vitest';
import { escapeMailLike, parseMailSearch } from './search';

describe('parseMailSearch', () => {
  it('parses structured operators and quoted values', () => {
    expect(
      parseMailSearch(
        'from:alice@example.com to:"team@example.com" subject:"Quarterly plan" is:unread has:attachment after:2026-07-01 label:finance budget'
      )
    ).toEqual({
      after: '2026-07-01',
      freeText: ['budget'],
      from: ['alice@example.com'],
      hasAttachment: true,
      labels: ['finance'],
      recipients: [{ kind: 'to', value: 'team@example.com' }],
      states: ['unread'],
      subject: ['Quarterly plan'],
    });
  });

  it('keeps unsupported and invalid operators as free text', () => {
    expect(
      parseMailSearch('before:tomorrow size:large "plain words"').freeText
    ).toEqual(['before:tomorrow', 'size:large', 'plain words']);
  });
});

describe('escapeMailLike', () => {
  it('escapes wildcard characters', () => {
    expect(escapeMailLike('100%_done')).toBe('100\\%\\_done');
  });
});
