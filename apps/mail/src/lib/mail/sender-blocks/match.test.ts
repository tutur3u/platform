import { describe, expect, it } from 'vitest';
import {
  exactLikePattern,
  matchesSenderBlock,
  normalizeSenderBlock,
  senderBlockCandidates,
} from './match';

describe('normalizeSenderBlock', () => {
  it('canonicalises addresses and bare domains', () => {
    expect(normalizeSenderBlock('address', ' Team@SePay.vn ')).toEqual({
      kind: 'address',
      value: 'team@sepay.vn',
    });
    expect(normalizeSenderBlock('domain', '@SePay.vn')).toEqual({
      kind: 'domain',
      value: 'sepay.vn',
    });
  });

  it('rejects malformed values and shared provider domains', () => {
    expect(normalizeSenderBlock('address', 'sepay.vn')).toBeNull();
    expect(normalizeSenderBlock('domain', 'team@sepay.vn')).toBeNull();
    expect(normalizeSenderBlock('domain', 'localhost')).toBeNull();
    expect(normalizeSenderBlock('domain', 'gmail.com')).toBeNull();
    expect(normalizeSenderBlock('domain', 'tuturuuu.com')).toBeNull();
  });
});

describe('senderBlockCandidates', () => {
  it('lists the address and every parent domain with two labels or more', () => {
    expect(senderBlockCandidates('A@mail.news.sepay.vn')).toEqual([
      { kind: 'address', value: 'a@mail.news.sepay.vn' },
      { kind: 'domain', value: 'mail.news.sepay.vn' },
      { kind: 'domain', value: 'news.sepay.vn' },
      { kind: 'domain', value: 'sepay.vn' },
    ]);
    expect(senderBlockCandidates(null)).toEqual([]);
    expect(senderBlockCandidates('not-an-address')).toEqual([]);
  });
});

describe('matchesSenderBlock', () => {
  const rules = [
    { kind: 'address' as const, value: 'team@sepay.vn' },
    { kind: 'domain' as const, value: 'spam.example' },
  ];

  it('matches exact addresses and domains including subdomains', () => {
    expect(matchesSenderBlock('TEAM@sepay.vn', rules)).toBe(true);
    expect(matchesSenderBlock('x@spam.example', rules)).toBe(true);
    expect(matchesSenderBlock('x@news.spam.example', rules)).toBe(true);
  });

  it('treats a trailing dot as the same domain', () => {
    expect(matchesSenderBlock('x@spam.example.', rules)).toBe(true);
    expect(matchesSenderBlock('team@sepay.vn.', rules)).toBe(true);
  });

  it('does not match look-alike domains or other senders', () => {
    expect(matchesSenderBlock('other@sepay.vn', rules)).toBe(false);
    expect(matchesSenderBlock('x@notspam.example', rules)).toBe(false);
    expect(matchesSenderBlock('spam.example@evil.vn', rules)).toBe(false);
    expect(
      matchesSenderBlock('x@sepay.vn', [{ kind: 'address', value: 'sepay.vn' }])
    ).toBe(false);
  });
});

describe('exactLikePattern', () => {
  it('escapes LIKE wildcards', () => {
    expect(exactLikePattern('john_doe%x@a.vn')).toBe('john\\_doe\\%x@a.vn');
    expect(exactLikePattern('a\\b@a.vn')).toBe('a\\\\b@a.vn');
  });
});
