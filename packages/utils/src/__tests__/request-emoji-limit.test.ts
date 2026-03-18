import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countEmojisInString,
  findRequestContentViolation,
  getRequestContentViolationForRequest,
  isTrustedEmojiBypassRequest,
  MAX_EMOJIS_PER_FIELD,
  MAX_REPEATED_GRAPHEME_RUN,
  MAX_SHORT_TEXT_FIELD_GRAPHEMES,
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
    const violation = findRequestContentViolation({
      wallet: {
        name: '🎉'.repeat(MAX_EMOJIS_PER_FIELD + 1),
      },
    });

    expect(violation).toEqual({
      code: 'EMOJI_LIMIT_EXCEEDED',
      path: 'body.wallet.name',
      count: MAX_EMOJIS_PER_FIELD + 1,
      limit: MAX_EMOJIS_PER_FIELD,
      message: 'Field "body.wallet.name" cannot contain more than 10 emojis',
    });
  });

  it('rejects text bombs in short-form metadata fields', () => {
    const violation = findRequestContentViolation({
      wallet: {
        name: '漢字仮名交響曲'.repeat(
          Math.ceil(
            (MAX_SHORT_TEXT_FIELD_GRAPHEMES + 1) / '漢字仮名交響曲'.length
          )
        ),
      },
    });

    expect(violation).toEqual({
      code: 'TEXT_BOMB_DETECTED',
      path: 'body.wallet.name',
      count: 287,
      limit: MAX_SHORT_TEXT_FIELD_GRAPHEMES,
      message:
        'Field "body.wallet.name" exceeds the maximum short-field length',
    });
  });

  it('rejects abusive repeated-character runs', () => {
    const violation = findRequestContentViolation({
      wallet: {
        description: `legit ${'文'.repeat(MAX_REPEATED_GRAPHEME_RUN + 1)}`,
      },
    });

    expect(violation).toEqual({
      code: 'TEXT_BOMB_DETECTED',
      path: 'body.wallet.description',
      count: MAX_REPEATED_GRAPHEME_RUN + 1,
      limit: MAX_REPEATED_GRAPHEME_RUN,
      message:
        'Field "body.wallet.description" contains an abusive repeated-character run',
    });
  });

  it('can skip validation for machine-generated snapshot fields', () => {
    const violation = findRequestContentViolation(
      {
        snapshot: `{"elements":[{"text":"${'0'.repeat(
          MAX_REPEATED_GRAPHEME_RUN + 20
        )}"}]}`,
        title: 'Board',
      },
      'body',
      { skipValidationForFields: ['snapshot'] }
    );

    expect(violation).toBeNull();
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

    await expect(
      getRequestContentViolationForRequest(request)
    ).resolves.toBeNull();
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

    await expect(
      getRequestContentViolationForRequest(request)
    ).resolves.toEqual({
      code: 'EMOJI_LIMIT_EXCEEDED',
      path: 'body.wallets[1].name',
      count: MAX_EMOJIS_PER_FIELD + 2,
      limit: MAX_EMOJIS_PER_FIELD,
      message:
        'Field "body.wallets[1].name" cannot contain more than 10 emojis',
    });
  });

  it('skips whiteboard snapshot validation when configured for the request', async () => {
    const request = makeRequest(
      JSON.stringify({
        snapshot: `{"elements":[{"text":"${'0'.repeat(
          MAX_REPEATED_GRAPHEME_RUN + 20
        )}"}]}`,
      })
    );

    await expect(
      getRequestContentViolationForRequest(request, {
        skipValidationForFields: ['snapshot'],
      })
    ).resolves.toBeNull();
  });
});
