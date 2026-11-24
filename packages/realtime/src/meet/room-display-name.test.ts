import { describe, expect, it } from 'vitest';
import { meetRealtimeClientMessageSchema } from './messages';
import { createMeetPresence, isMeetExternalParticipant } from './room';
import {
  lobbyDisplayName,
  normalizeDisplayNameText,
  stripLegacyGuestSuffix,
  upgradeLegacyGuestMarkers,
} from './room-display-name';
import { meetRealtimeTokenPayloadSchema } from './primitives';

describe('lobby display name normalisation', () => {
  it.each([
    ['ASCII padding', `Host Name${' '.repeat(100)}x`],
    ['line separator', `Host Name   x`],
    ['paragraph separator', `Host Name x`],
    ['ideographic space', `Host Name${'　'.repeat(100)}x`],
    ['no-break and thin spaces', `Host Name   x`],
    ['tabs and newlines', 'Host Name\t\n\r x'],
  ])('collapses %s to one space', (_label, raw) => {
    expect(normalizeDisplayNameText(raw)).toBe('Host Name x');
    expect(lobbyDisplayName(raw)).toBe(`Host Name x`);
  });

  it('drops trailing padding from the name', () => {
    const name = lobbyDisplayName(`Host Name${'　'.repeat(200)}`);
    expect(name).toBe(`Host Name`);
  });

  it('caps at 120 without a dangling space', () => {
    const name = lobbyDisplayName(`${'a'.repeat(119)} ${'b'.repeat(50)}`);
    expect(name).toBe('a'.repeat(119));
    expect(name).not.toMatch(/\s$/);
  });

  it('never bakes a guest marker into the chosen name', () => {
    expect(lobbyDisplayName('Lan')).toBe('Lan');
    expect(lobbyDisplayName('Lan (guest)')).toBe('Lan');
  });

  it('strips bidi and control characters before collapsing', () => {
    expect(lobbyDisplayName('Host‮ ​ Name')).toBe(`Host Name`);
  });

  it('normalises the presence.join schema the same way', () => {
    const parsed = meetRealtimeClientMessageSchema.safeParse({
      type: 'presence.join',
      displayName: `Host${'　'.repeat(50)}Name `,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'presence.join')
      expect(parsed.data.displayName).toBe('Host Name');
  });
});

describe('legacy guest suffix', () => {
  it.each([
    ['Lan (guest)', 'Lan'],
    ['Lan', 'Lan'],
    ['(guest)', '(guest)'],
    [' (guest)', ' (guest)'],
    ['Guest House', 'Guest House'],
  ])('strips %j to %j', (raw, expected) => {
    expect(stripLegacyGuestSuffix(raw)).toBe(expected);
  });
});

describe('outside-account classification', () => {
  const base = meetRealtimeTokenPayloadSchema.parse({
    exp: 2_000_000_000,
    limits: {},
    meetingId: '6d6f0b1a-4d2b-4a0b-9a3e-0c7f3e1d2a10',
    role: 'speaker',
    roomId: 'room',
    userId: '4b320da6-6c8a-43fe-b1bf-09fbe77303f9',
    wsId: '0f4c1d2e-3b4a-4c5d-8e6f-7a8b9c0d1e2f',
  });

  it.each([
    ['workspace member', { admission: 'open' as const }, false],
    ['signed-in non-member', { admission: 'lobby' as const }, true],
    [
      'anonymous guest',
      { admission: 'lobby' as const, guest: true as const },
      false,
    ],
    ['host', { admission: 'lobby' as const, role: 'host' as const }, false],
  ])('%s', (_label, patch, external) => {
    const token = { ...base, ...patch };
    expect(isMeetExternalParticipant(token)).toBe(external);
    const person = createMeetPresence(token, '2026-11-24T03:00:00.000Z');
    expect(person.external === true).toBe(external);
    expect(person.guest === true).toBe(token.guest === true);
  });
});

describe('legacy room upgrade', () => {
  const entry = (userId: string, displayName: string, guest?: true) => ({
    userId,
    displayName,
    ...(guest ? { guest } : {}),
  });

  it('moves the baked suffix into structured flags', () => {
    const state = {
      approved: { outside: entry('outside', 'Free QA (guest)') },
      chat: [
        entry('outside', 'Free QA (guest)'),
        entry('anon', 'Lan (guest)'),
        entry('member', 'Minh'),
      ],
      presence: {
        outside: entry('outside', 'Free QA (guest)'),
        anon: entry('anon', 'Lan (guest)', true),
        member: entry('member', 'Minh'),
      },
      waiting: { late: entry('late', 'Late (guest)') },
    };
    const next = upgradeLegacyGuestMarkers(state);
    expect(next.presence.outside).toEqual({
      userId: 'outside',
      displayName: 'Free QA',
      external: true,
    });
    expect(next.presence.anon).toEqual({
      userId: 'anon',
      displayName: 'Lan',
      guest: true,
    });
    expect(next.presence.member).toBe(state.presence.member);
    expect(next.waiting.late).toMatchObject({
      displayName: 'Late',
      external: true,
    });
    expect(next.approved?.outside).toMatchObject({
      displayName: 'Free QA',
      external: true,
    });
    expect(next.chat?.[0]).toMatchObject({
      displayName: 'Free QA',
      external: true,
    });
    expect(next.chat?.[1]).toMatchObject({ displayName: 'Lan', guest: true });
    expect(next.chat?.[1]).not.toHaveProperty('external');
    expect(next.chat?.[2]).toBe(state.chat[2]);
  });

  it('returns the same state when nothing is legacy', () => {
    const state = {
      presence: { member: entry('member', 'Minh') },
      waiting: {},
    };
    expect(upgradeLegacyGuestMarkers(state)).toBe(state);
  });
});
