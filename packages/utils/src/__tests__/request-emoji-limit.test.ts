import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countEmojisInString,
  findEmojiLimitViolation,
  getEmojiLimitViolationForRequest,
  isTrustedEmojiBypassRequest,
  MAX_EMOJIS_PER_FIELD,
  shouldValidateEmojiLimit,
} from '../request-emoji-limit';

function makeRequest(
  body: string,
  options?: {
    contentType?: string;
    headers?: Record<string, string>;
    method?: string;
  }
) {
  return new NextRequest('http://localhost/api/test', {
    method: options?.method ?? 'POST',
    headers: {
      'Content-Type': options?.contentType ?? 'application/json',
      ...(options?.headers ?? {}),
    },
    body,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('request emoji limit', () => {
  it('counts pictographic emojis without counting plain numbers', () => {
    expect(countEmojisInString('wallet 123')).toBe(0);
    expect(countEmojisInString(`wallet ${'🎉'.repeat(3)}`)).toBe(3);
  });

  it('counts flag emoji graphemes correctly', () => {
    expect(countEmojisInString('🇻🇳'.repeat(2))).toBe(2);
  });

  it('finds the first nested field over the limit', () => {
    const violation = findEmojiLimitViolation({
      wallet: {
        name: '🎉'.repeat(MAX_EMOJIS_PER_FIELD + 1),
      },
    });

    expect(violation).toEqual({
      path: 'body.wallet.name',
      emojiCount: MAX_EMOJIS_PER_FIELD + 1,
    });
  });

  it('skips validation for non-json requests', () => {
    const request = makeRequest('name=test', {
      contentType: 'application/x-www-form-urlencoded',
    });

    expect(shouldValidateEmojiLimit(request)).toBe(false);
  });

  it('detects trusted cron or service-role callers', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    const request = makeRequest(JSON.stringify({ name: '🎉'.repeat(20) }), {
      headers: { Authorization: 'Bearer cron-secret' },
    });

    expect(isTrustedEmojiBypassRequest(request)).toBe(true);
  });

  it('returns null for trusted callers even when payload exceeds the limit', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret');
    const request = makeRequest(JSON.stringify({ name: '🎉'.repeat(20) }), {
      headers: { Authorization: 'Bearer service-role-secret' },
    });

    await expect(getEmojiLimitViolationForRequest(request)).resolves.toBeNull();
  });

  it('returns the offending field for untrusted JSON mutations', async () => {
    const request = makeRequest(
      JSON.stringify({
        wallets: [
          { name: 'ok' },
          { name: '🎉'.repeat(MAX_EMOJIS_PER_FIELD + 2) },
        ],
      })
    );

    await expect(getEmojiLimitViolationForRequest(request)).resolves.toEqual({
      path: 'body.wallets[1].name',
      emojiCount: MAX_EMOJIS_PER_FIELD + 2,
    });
  });
});
