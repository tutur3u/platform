import { describe, expect, it } from 'vitest';
import { isQuietTime, validateQuietHours } from './quiet-hours';
import { decideReply, type ReplyPolicy } from './rules';
import type { MiraInboundEvent } from './types';

const NOON_ICT = Date.UTC(2026, 10, 21, 5, 0); // 12:00 in Asia/Ho_Chi_Minh
const LATE_ICT = Date.UTC(2026, 10, 21, 16, 0); // 23:00 in Asia/Ho_Chi_Minh

const QUIET = {
  startMinute: 22 * 60 + 30,
  endMinute: 7 * 60,
  timeZone: 'Asia/Ho_Chi_Minh',
};

function event(overrides: Partial<MiraInboundEvent> = {}): MiraInboundEvent {
  return {
    channel: 'zalo',
    providerAccountId: 'acct',
    providerEventId: 'evt-1',
    conversationId: 'chat-1',
    conversationType: 'group',
    senderId: 'sender-1',
    providerTimestampMs: NOON_ICT,
    fromSelf: false,
    addressesMira: false,
    ...overrides,
  };
}

function policy(overrides: Partial<ReplyPolicy> = {}): ReplyPolicy {
  return { neverSilent: true, quietHours: QUIET, tenant: {}, ...overrides };
}

describe('quiet hours', () => {
  it('handles windows that cross midnight', () => {
    expect(isQuietTime(QUIET, NOON_ICT)).toBe(false);
    expect(isQuietTime(QUIET, LATE_ICT)).toBe(true);
    expect(isQuietTime(null, LATE_ICT)).toBe(false);
  });
});

describe('decideReply', () => {
  it('still replies when quiet hours are misconfigured', () => {
    expect(
      decideReply({
        event: event({ conversationType: 'direct' }),
        policy: policy({
          quietHours: { startMinute: 0, endMinute: 60, timeZone: 'Bad/Zone' },
        }),
        nowMs: NOON_ICT,
      })
    ).toMatchObject({ action: 'respond', style: 'normal' });
    expect(() =>
      validateQuietHours({
        startMinute: 0,
        endMinute: 60,
        timeZone: 'Bad/Zone',
      })
    ).toThrow('Invalid time zone');
    expect(() => validateQuietHours({ ...QUIET, endMinute: 1440 })).toThrow();
  });

  it('answers groups only when addressed', () => {
    expect(
      decideReply({ event: event(), policy: policy(), nowMs: NOON_ICT })
    ).toEqual({ action: 'ignore', reason: 'not_addressed' });
    expect(
      decideReply({
        event: event({ addressesMira: true }),
        policy: policy(),
        nowMs: NOON_ICT,
      })
    ).toMatchObject({
      action: 'respond',
      reason: 'addressed',
      style: 'normal',
    });
  });

  it('always answers direct messages', () => {
    expect(
      decideReply({
        event: event({ conversationType: 'direct' }),
        policy: policy(),
        nowMs: NOON_ICT,
      })
    ).toMatchObject({ action: 'respond', reason: 'direct' });
  });

  it('shortens replies in quiet hours but never skips them', () => {
    expect(
      decideReply({
        event: event({ addressesMira: true }),
        policy: policy(),
        nowMs: LATE_ICT,
      })
    ).toMatchObject({ action: 'respond', style: 'brief' });
  });

  it('acknowledges a muted person who addresses Mira when never-silent', () => {
    const muted = policy({ person: { reply: 'mute' } });
    const addressed = event({ addressesMira: true });
    expect(
      decideReply({ event: addressed, policy: muted, nowMs: NOON_ICT })
    ).toEqual({ action: 'acknowledge', reason: 'muted_but_addressed' });
    expect(
      decideReply({
        event: addressed,
        policy: { ...muted, neverSilent: false },
        nowMs: NOON_ICT,
      })
    ).toEqual({ action: 'ignore', reason: 'muted' });
  });

  it('resolves chat before person before channel before tenant', () => {
    const layered = policy({
      tenant: { reply: 'mute', tagOwner: false },
      channel: { reply: 'escalate' },
      person: { tagOwner: true },
      chat: { reply: 'reply' },
    });
    expect(
      decideReply({
        event: event({ addressesMira: true }),
        policy: layered,
        nowMs: NOON_ICT,
      })
    ).toMatchObject({ action: 'respond', escalate: false, tagOwner: true });
  });

  it('triages untagged owner instructions only until the rule expires', () => {
    const ownerGroup = policy({
      chat: {
        ownerInstructions: {
          ownerSenderIds: ['owner'],
          expiresAtMs: NOON_ICT + 1,
        },
      },
    });
    expect(
      decideReply({
        event: event({ senderId: 'owner' }),
        policy: ownerGroup,
        nowMs: NOON_ICT,
      })
    ).toEqual({ action: 'triage', reason: 'owner_instruction' });
    expect(
      decideReply({
        event: event({ senderId: 'someone-else' }),
        policy: ownerGroup,
        nowMs: NOON_ICT,
      })
    ).toEqual({ action: 'ignore', reason: 'not_addressed' });
    expect(
      decideReply({
        event: event({ senderId: 'owner' }),
        policy: ownerGroup,
        nowMs: NOON_ICT + 1,
      })
    ).toEqual({ action: 'ignore', reason: 'not_addressed' });
  });

  it('triages watched groups unless the sender is muted', () => {
    const watched = policy({ chat: { watch: true } });
    expect(
      decideReply({ event: event(), policy: watched, nowMs: NOON_ICT })
    ).toEqual({ action: 'triage', reason: 'watch' });
    expect(
      decideReply({
        event: event(),
        policy: { ...watched, person: { reply: 'mute' } },
        nowMs: NOON_ICT,
      })
    ).toEqual({ action: 'ignore', reason: 'muted' });
  });
});
