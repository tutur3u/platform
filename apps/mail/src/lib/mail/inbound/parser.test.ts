import { describe, expect, it } from 'vitest';
import { normalizeAddress, parseRawEmail } from './parser';

describe('mail address parsing', () => {
  it('extracts bracketed addresses without regex backtracking', () => {
    const prefix = '<'.repeat(100_000);
    expect(normalizeAddress(`${prefix}user@example.com>`)).toBe(
      'user@example.com'
    );
  });

  it('preserves display names and normalized addresses', () => {
    const parsed = parseRawEmail(
      [
        'From: "Example Sender" <Sender@Example.COM>',
        'To: Receiver@Example.COM',
        'Subject: Test',
        '',
        'Hello',
      ].join('\r\n')
    );

    expect(parsed.from).toEqual({
      address: 'sender@example.com',
      displayName: 'Example Sender',
    });
    expect(parsed.to).toEqual([
      { address: 'receiver@example.com', displayName: null },
    ]);
  });
});
