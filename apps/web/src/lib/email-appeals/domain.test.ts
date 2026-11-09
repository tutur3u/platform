import { describe, expect, it } from 'vitest';
import {
  APPEAL_LIFETIME_MS,
  appealRequestSchema,
  hashAppealToken,
  issueAppealToken,
  verifyAppealToken,
} from './domain';

const wsId = '11111111-1111-4111-8111-111111111111';
const key = 'isolated-test-signing-key-32-bytes-minimum';
const now = 1_800_000_000_000;

describe('appeal challenge', () => {
  it('binds a random signed challenge to one workspace for 24 hours', () => {
    const first = issueAppealToken(wsId, key, now);
    const second = issueAppealToken(wsId, key, now);
    expect(first).not.toBe(second);
    expect(verifyAppealToken(first, key, now)).toMatchObject({
      wsId,
      expiresAt: now + APPEAL_LIFETIME_MS,
    });
    expect(hashAppealToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAppealToken(first)).not.toContain(first);
  });
  it('expires at the exclusive expiry boundary', () => {
    const token = issueAppealToken(wsId, key, now);
    expect(() =>
      verifyAppealToken(token, key, now + APPEAL_LIFETIME_MS - 1)
    ).not.toThrow();
    expect(() =>
      verifyAppealToken(token, key, now + APPEAL_LIFETIME_MS)
    ).toThrow('expired_token');
  });
  it('refuses payload or signature tampering and another signing key', () => {
    const token = issueAppealToken(wsId, key, now);
    const [body, signature] = token.split('.');
    expect(() => verifyAppealToken(`A${body}.${signature}`, key, now)).toThrow(
      'invalid_token'
    );
    const tamperedSignature = `${signature?.startsWith('A') ? 'B' : 'A'}${signature?.slice(1)}`;
    expect(() =>
      verifyAppealToken(`${body}.${tamperedSignature}`, key, now)
    ).toThrow('invalid_token');
    expect(() => verifyAppealToken(token, `${key}-other`, now)).toThrow(
      'invalid_token'
    );
  });
  it.each(['', '.', 'a.b', 'x'.repeat(1025)])(
    'refuses malformed token %s',
    (token) => {
      expect(() => verifyAppealToken(token, key, now)).toThrow('invalid_token');
    }
  );
  it('refuses weak signing keys', () => {
    expect(() => issueAppealToken(wsId, 'weak', now)).toThrow(
      'transport_unavailable'
    );
  });
  it('requires a substantive reason and exact request fields', () => {
    expect(
      appealRequestSchema.safeParse({
        email: 'member@example.com',
        reason: ' ',
      }).success
    ).toBe(false);
    expect(
      appealRequestSchema.safeParse({
        email: 'member@example.com',
        reason: 'Mailbox repaired',
        override: true,
      }).success
    ).toBe(false);
    expect(
      appealRequestSchema.parse({
        email: 'Member@example.com',
        reason: 'Mailbox repaired',
      }).email
    ).toBe('member@example.com');
  });
});
