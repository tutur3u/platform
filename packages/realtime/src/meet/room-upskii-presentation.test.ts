import { describe, expect, it } from 'vitest';
import { meetRealtimeClientMessageSchema } from './messages';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  type MeetRoomSnapshot,
} from './room';
import { endMeetRoom } from './room-ending';
import {
  applyUpskiiPresentation,
  resolveUpskiiOrigin,
  toSafeUpskiiUrl,
  UPSKII_ORIGIN,
  UPSKII_PRESENTATION_ACTIONS_PER_MINUTE,
} from './room-upskii-presentation';

const now = '2026-12-05T08:00:00Z';
const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'upskii',
  wsId: crypto.randomUUID(),
  meetingId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  role: 'host',
  exp: 2_000_000_000,
});
const guest = { ...host, role: 'speaker' as const, userId: crypto.randomUUID() };
const outsider = { ...guest, userId: crypto.randomUUID() };
const room = (): MeetRoomSnapshot => ({
  ...createMeetRoomSnapshot(),
  presence: Object.fromEntries(
    [host, guest].map((token) => [token.userId, createMeetPresence(token, now)])
  ),
});
const lesson = {
  kind: 'lesson',
  id: 'l4',
  title: 'Responsible AI in your class',
  classTitle: 'EduFest',
  url: 'https://upskii.com/classes/c1/lessons/l4',
};
const run = (state: MeetRoomSnapshot, token: typeof host, input: unknown) => {
  const result = applyUpskiiPresentation(state, {
    message: meetRealtimeClientMessageSchema.parse(input),
    token,
    now,
  });
  if (!result) throw new Error('Expected an Upskii outcome');
  return result;
};
const errorOf = (result: ReturnType<typeof run>) =>
  (result.reply[0] as { error?: string } | undefined)?.error;

describe('toSafeUpskiiUrl', () => {
  it.each([
    'https://upskii.com/classes/c1/lessons/l4',
    'https://upskii.com/a?tab=quiz&next=/classes/c1',
    'https://upskii.com/a#section-2',
  ])('keeps %s', (url) => {
    expect(toSafeUpskiiUrl(url)).toBe(new URL(url).href);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://upskii.com/lesson',
    'https://upskii.com.evil.test/lesson',
    'https://evil.test/upskii.com',
    'https://upskii.com:8443/lesson',
    'https://user:pass@upskii.com/lesson',
    'https://www.upskii.com/lesson',
    'https://upskii.com/out?to=https://evil.test',
    'https://upskii.com/out?next=//evil.test',
    'https://upskii.com/out?next=%2F%2Fevil.test',
    'https://upskii.com/out?r=javascript:alert(1)',
    'https://upskii.com/out#redirect=https://evil.test',
    '/classes/c1',
    '',
    `https://upskii.com/${'a'.repeat(2100)}`,
  ])('drops %s', (url) => {
    expect(toSafeUpskiiUrl(url)).toBeNull();
  });

  it('drops values that are not strings', () => {
    expect(toSafeUpskiiUrl(null)).toBeNull();
    expect(toSafeUpskiiUrl({ href: lesson.url })).toBeNull();
  });

  it('checks against an overridden origin exactly', () => {
    const staging = 'https://staging.upskii.com';
    expect(toSafeUpskiiUrl(`${staging}/x`, staging)).toBe(`${staging}/x`);
    expect(toSafeUpskiiUrl(lesson.url, staging)).toBeNull();
  });
});

describe('resolveUpskiiOrigin', () => {
  it('accepts only a bare https origin', () => {
    expect(resolveUpskiiOrigin(undefined)).toBe(UPSKII_ORIGIN);
    expect(resolveUpskiiOrigin('https://staging.upskii.com')).toBe(
      'https://staging.upskii.com'
    );
    expect(resolveUpskiiOrigin('https://staging.upskii.com/')).toBe(
      'https://staging.upskii.com'
    );
    for (const value of [
      'http://staging.upskii.com',
      'https://staging.upskii.com/path',
      'https://u:p@staging.upskii.com',
      'https://staging.upskii.com?x=1',
      'not a url',
    ])
      expect(resolveUpskiiOrigin(value)).toBe(UPSKII_ORIGIN);
  });
});

describe('applyUpskiiPresentation', () => {
  it('ignores other messages', () => {
    expect(
      applyUpskiiPresentation(room(), {
        message: meetRealtimeClientMessageSchema.parse({
          type: 'penboard.read',
        }),
        token: host,
        now,
      })
    ).toBeNull();
  });

  it('lets the host present and everyone read, and broadcasts each change', () => {
    const initial = room();
    expect(
      run(initial, guest, { type: 'upskii.present.read', requestId: 'r0' })
        .reply
    ).toEqual([
      { type: 'upskii.presentation', presentation: null, requestId: 'r0' },
    ]);

    const set = run(initial, host, {
      type: 'upskii.present.set',
      item: lesson,
      requestId: 'r1',
    });
    const presentation = {
      item: lesson,
      presenterId: host.userId,
      startedAt: now,
      revision: 1,
    };
    expect(set.broadcast).toEqual([
      { type: 'upskii.presentation', presentation },
    ]);
    expect(set.reply).toEqual([
      { type: 'upskii.presentation', presentation, requestId: 'r1' },
    ]);
    expect(
      run(set.state, guest, { type: 'upskii.present.read' }).reply
    ).toEqual([{ type: 'upskii.presentation', presentation }]);

    const cleared = run(set.state, host, { type: 'upskii.present.clear' });
    expect(cleared.state.upskiiPresentation).toBeUndefined();
    expect(cleared.broadcast).toEqual([
      { type: 'upskii.presentation', presentation: null },
    ]);
  });

  it('refuses participants, people not admitted and the lobby', () => {
    const initial = room();
    expect(
      errorOf(
        run(initial, guest, { type: 'upskii.present.set', item: lesson })
      )
    ).toBe('permission_denied');
    expect(
      errorOf(run(initial, outsider, { type: 'upskii.present.read' }))
    ).toBe('awaiting_admission');
    const waiting = {
      ...initial,
      waiting: { [guest.userId]: initial.presence[guest.userId] },
    } as MeetRoomSnapshot;
    expect(errorOf(run(waiting, guest, { type: 'upskii.present.read' }))).toBe(
      'awaiting_admission'
    );
  });

  it('re-checks the link on the room, whatever the client sent', () => {
    for (const url of [
      'javascript:alert(1)',
      'https://evil.test/lesson',
      'https://upskii.com/out?to=https://evil.test',
    ]) {
      const result = run(room(), host, {
        type: 'upskii.present.set',
        item: { ...lesson, url },
      });
      expect(errorOf(result)).toBe('upskii_url_rejected');
      expect(result.state.upskiiPresentation).toBeUndefined();
    }
  });

  it('rejects oversized or control-character labels at the schema', () => {
    for (const item of [
      { ...lesson, title: 'x'.repeat(161) },
      { ...lesson, title: 'a\u0000b' },
      { ...lesson, id: '../etc' },
      { ...lesson, kind: 'class' },
    ])
      expect(
        meetRealtimeClientMessageSchema.safeParse({
          type: 'upskii.present.set',
          item,
        }).success
      ).toBe(false);
  });

  it('never stores lesson bodies a client tries to attach', () => {
    const result = run(room(), host, {
      type: 'upskii.present.set',
      item: { ...lesson, body: '<p>full lesson</p>', answers: ['b'] },
    });
    expect(result.state.upskiiPresentation?.item).toEqual(lesson);
  });

  it('rate-limits a presenter', () => {
    let state = room();
    for (let index = 0; index < UPSKII_PRESENTATION_ACTIONS_PER_MINUTE; index++)
      state = run(state, host, {
        type: 'upskii.present.set',
        item: lesson,
      }).state;
    expect(
      errorOf(run(state, host, { type: 'upskii.present.set', item: lesson }))
    ).toBe('upskii_rate_limited');
  });

  it('drops the presentation when the room ends', () => {
    const set = run(room(), host, { type: 'upskii.present.set', item: lesson });
    const ended = endMeetRoom(set.state, now);
    expect(ended.upskiiPresentation).toBeUndefined();
    expect(ended.upskiiPresentationLimits).toBeUndefined();
  });
});
