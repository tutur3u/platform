import { describe, expect, it } from 'vitest';

import {
  formatEmailAddresses,
  isEmail,
  isIncompleteEmail,
  isValidTuturuuuEmail,
  suggestEmails,
} from '../client';

describe('formatEmailAddresses', () => {
  it('parses name and email from formatted string', () => {
    const result = formatEmailAddresses('Jane Doe <jane@tuturuuu.com>');

    expect(result).toEqual([
      {
        name: 'Jane Doe',
        email: 'jane@tuturuuu.com',
        raw: 'Jane Doe <jane@tuturuuu.com>',
      },
    ]);
  });

  it('handles simple email without display name', () => {
    const result = formatEmailAddresses('user@example.com');

    expect(result).toEqual([
      {
        name: '',
        email: 'user@example.com',
        raw: 'user@example.com',
      },
    ]);
  });

  it('returns fallback object when value is not an email', () => {
    const result = formatEmailAddresses('not-an-email');

    expect(result).toEqual([
      {
        name: '',
        email: '',
        raw: 'not-an-email',
      },
    ]);
  });

  it('filters out non-string values when provided in an array', () => {
    const result = formatEmailAddresses([
      'Alice <alice@example.com>',
      123 as unknown as string,
    ]);

    expect(result).toEqual([
      {
        name: 'Alice',
        email: 'alice@example.com',
        raw: 'Alice <alice@example.com>',
      },
    ]);
  });

  it('returns an empty array for falsy input', () => {
    expect(formatEmailAddresses(undefined)).toEqual([]);
  });
});

describe('isValidTuturuuuEmail', () => {
  it('accepts first-party tuturuuu domains', () => {
    expect(isValidTuturuuuEmail('member@tuturuuu.com')).toBe(true);
    expect(isValidTuturuuuEmail('member@xwf.tuturuuu.com')).toBe(true);
  });

  it('rejects other domains and falsy values', () => {
    expect(isValidTuturuuuEmail('member@example.com')).toBe(false);
    expect(isValidTuturuuuEmail('member@sub.tuturuuu.com')).toBe(false);
    expect(isValidTuturuuuEmail(null)).toBe(false);
    expect(isValidTuturuuuEmail(undefined)).toBe(false);
  });
});

describe('isEmail', () => {
  it('validates complex email formats', () => {
    expect(isEmail('user.name+alias@example.co.uk')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isEmail('missing-at-symbol.com')).toBe(false);
    expect(isEmail(' user@example.com')).toBe(false);
  });
});

describe('isIncompleteEmail', () => {
  it('detects emails missing domain details', () => {
    expect(isIncompleteEmail('user@domain')).toBe(true);
    expect(isIncompleteEmail('user@domain c')).toBe(true);
  });

  it('rejects complete or invalid starts', () => {
    expect(isIncompleteEmail('user@domain.com')).toBe(false);
    expect(isIncompleteEmail('@domain.com')).toBe(false);
    expect(isIncompleteEmail('')).toBe(false);
  });
});

describe('suggestEmails', () => {
  it('returns provider list when no handle provided', () => {
    expect(suggestEmails('')).toEqual([
      '@gmail.com',
      '@yahoo.com',
      '@outlook.com',
      '@tuturuuu.com',
    ]);
  });

  it('uses the provided handle when available', () => {
    expect(suggestEmails('handle')).toEqual([
      'handle@gmail.com',
      'handle@yahoo.com',
      'handle@outlook.com',
      'handle@tuturuuu.com',
    ]);
    expect(suggestEmails('handle@existing.com')).toEqual([
      'handle@gmail.com',
      'handle@yahoo.com',
      'handle@outlook.com',
      'handle@tuturuuu.com',
    ]);
  });
});
