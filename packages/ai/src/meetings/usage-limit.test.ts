import {
  type AbuseGuardClient,
  AbuseGuardUnavailableError,
  type GuardWindowOutcome,
  type GuardWindowSubject,
} from '@tuturuuu/utils/abuse-guard/client';
import type { AbuseGuardSelection } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMeetAiUsage,
  estimateRecordingSeconds,
  MEET_AI_LIMIT_DEFAULTS,
  type MeetAiUsageInput,
  planMeetAiUsageWindows,
  resetMeetAiUsageLimiterCache,
  resolveMeetAiLimits,
} from './usage-limit';

/** In-memory model of the store: sequential, all-or-nothing, weighted. */
function fakeGuard(family: 'meet' | 'offline' = 'meet') {
  const counters = new Map<string, { index: number; count: number }>();
  const calls: GuardWindowSubject[][] = [];
  let clock = 1_000_000;
  const client = {
    family,
    withFairness: () => client,
    async hitWindows(subjects: GuardWindowSubject[]) {
      calls.push(subjects);
      for (const [subjectIndex, subject] of subjects.entries()) {
        const states = subject.windows.map((window) => {
          const key = `${subject.partition}|${window.key}`;
          const index = Math.floor(clock / window.windowMs);
          const current = counters.get(key);
          const count = current?.index === index ? current.count : 0;
          const cost = window.cost ?? 1;
          return {
            key,
            index,
            count,
            cost,
            allowed: count + cost <= window.limit,
            remaining: Math.max(0, window.limit - count - cost),
            resetAt: (index + 1) * window.windowMs,
          };
        });
        if (states.some((state) => !state.allowed)) {
          return {
            ok: false,
            subjectIndex,
            resetAt: Math.max(
              ...states.filter((s) => !s.allowed).map((s) => s.resetAt)
            ),
            windows: states.map((s) => ({
              remaining: s.allowed ? s.remaining : 0,
              resetAt: s.resetAt,
            })),
          } satisfies GuardWindowOutcome;
        }
        for (const state of states)
          counters.set(state.key, {
            index: state.index,
            count: state.count + state.cost,
          });
      }
      return { ok: true, remaining: 1, resetAt: clock, windows: [] };
    },
  } as unknown as AbuseGuardClient;
  return {
    selection: { kind: 'durable-object', client } as AbuseGuardSelection,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

const chunk = (
  overrides: Partial<MeetAiUsageInput> = {}
): MeetAiUsageInput => ({
  kind: 'chunk',
  userId: 'user-a',
  meetingId: 'meeting-1',
  workspaceId: 'ws-1',
  audioSeconds: 15,
  ...overrides,
});

beforeEach(() => {
  resetMeetAiUsageLimiterCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('resolveMeetAiLimits', () => {
  it('keeps conservative defaults without overrides', () => {
    expect(resolveMeetAiLimits(undefined)).toEqual(MEET_AI_LIMIT_DEFAULTS);
    expect(resolveMeetAiLimits({})).toEqual(MEET_AI_LIMIT_DEFAULTS);
  });

  it('accepts positive integer overrides', () => {
    expect(
      resolveMeetAiLimits({
        MEET_AI_LIMIT_USER_MEETING_REQUESTS_PER_MINUTE: ' 7 ',
        MEET_AI_LIMIT_WORKSPACE_AUDIO_SECONDS_PER_DAY: '1000000',
      })
    ).toMatchObject({
      userMeetingRequestsPerMinute: 7,
      workspaceAudioSecondsPerDay: 1_000_000,
    });
  });

  it.each([
    '0',
    '-1',
    '1.5',
    '1e3',
    'abc',
    '1000001',
    '99999999',
    ' ',
    'Infinity',
  ])('keeps the default for %j (never unlimited)', (value) => {
    expect(
      resolveMeetAiLimits({ MEET_AI_LIMIT_MEETING_NOTES_PER_HOUR: value })
        .meetingNotesPerHour
    ).toBe(MEET_AI_LIMIT_DEFAULTS.meetingNotesPerHour);
  });
});

describe('planMeetAiUsageWindows', () => {
  it('orders actor, meeting, workspace and charges audio seconds', () => {
    const plan = planMeetAiUsageWindows(
      chunk({ audioSeconds: 14.2 }),
      MEET_AI_LIMIT_DEFAULTS
    );
    expect(plan.map((subject) => subject.partition)).toEqual([
      'actor:user-a',
      'meeting:meeting-1',
      'workspace:ws-1',
    ]);
    expect(plan[0]?.windows[0]).not.toHaveProperty('cost');
    expect(plan[0]?.windows.slice(1).map((w) => w.cost)).toEqual([15, 15]);
    expect(plan.every((subject) => subject.windows.length <= 4)).toBe(true);
  });

  it('charges recordings only against daily audio windows', () => {
    const plan = planMeetAiUsageWindows(
      {
        kind: 'recording',
        userId: 'u',
        meetingId: 'm',
        workspaceId: 'w',
        audioSeconds: estimateRecordingSeconds(18 * 1024 * 1024),
      },
      MEET_AI_LIMIT_DEFAULTS
    );
    const audio = plan.flatMap((subject) =>
      subject.windows.filter((w) => w.key.startsWith('audio'))
    );
    expect(audio.every((w) => w.windowMs === 86_400_000)).toBe(true);
    expect(audio[0]?.cost).toBe(9438);
  });
});

describe('checkMeetAiUsage', () => {
  it('allows within limits and refuses with 429 once a user hits the request cap', async () => {
    const guard = fakeGuard();
    const env = { MEET_AI_LIMIT_USER_MEETING_REQUESTS_PER_MINUTE: '3' };
    for (let i = 0; i < 3; i++) {
      await expect(
        checkMeetAiUsage(chunk({ audioSeconds: 1 }), {
          selection: guard.selection,
          env,
          now: guard.now,
        })
      ).resolves.toEqual({ ok: true });
    }
    const denied = await checkMeetAiUsage(chunk({ audioSeconds: 1 }), {
      selection: guard.selection,
      env,
      now: guard.now,
    });
    expect(denied).toMatchObject({
      ok: false,
      status: 429,
      code: 'MEET_AI_RATE_LIMITED',
      scope: 'user',
    });
    expect(denied.ok === false && denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('caches a denial locally so a hammering client spends no store ops', async () => {
    const guard = fakeGuard();
    const env = { MEET_AI_LIMIT_USER_MEETING_REQUESTS_PER_MINUTE: '1' };
    const options = { selection: guard.selection, env, now: guard.now };
    await checkMeetAiUsage(chunk(), options);
    await checkMeetAiUsage(chunk(), options);
    expect(guard.calls).toHaveLength(2);
    for (let i = 0; i < 5; i++)
      await expect(checkMeetAiUsage(chunk(), options)).resolves.toMatchObject({
        status: 429,
      });
    expect(guard.calls).toHaveLength(2);
    // After the window resets the store is asked again.
    guard.advance(60_000);
    await expect(checkMeetAiUsage(chunk(), options)).resolves.toEqual({
      ok: true,
    });
    expect(guard.calls).toHaveLength(3);
  });

  it('holds the per-meeting audio cap across participants', async () => {
    const guard = fakeGuard();
    const env = { MEET_AI_LIMIT_MEETING_AUDIO_SECONDS_PER_10_MIN: '40' };
    const options = { selection: guard.selection, env, now: guard.now };
    await expect(
      checkMeetAiUsage(chunk({ userId: 'host' }), options)
    ).resolves.toEqual({ ok: true });
    await expect(
      checkMeetAiUsage(chunk({ userId: 'guest-1' }), options)
    ).resolves.toEqual({ ok: true });
    // 30 s spent; a third participant's 15 s would make 45 > 40.
    await expect(
      checkMeetAiUsage(chunk({ userId: 'guest-2' }), options)
    ).resolves.toMatchObject({ status: 429, scope: 'meeting' });
    // Another meeting in the same workspace is unaffected.
    await expect(
      checkMeetAiUsage(
        chunk({ userId: 'guest-2', meetingId: 'meeting-2' }),
        options
      )
    ).resolves.toEqual({ ok: true });
  });

  it('holds the per-workspace daily cap across meetings and users', async () => {
    const guard = fakeGuard();
    const env = { MEET_AI_LIMIT_WORKSPACE_AUDIO_SECONDS_PER_DAY: '30' };
    const options = { selection: guard.selection, env, now: guard.now };
    await checkMeetAiUsage(chunk({ userId: 'a', meetingId: 'm1' }), options);
    await checkMeetAiUsage(chunk({ userId: 'b', meetingId: 'm2' }), options);
    await expect(
      checkMeetAiUsage(chunk({ userId: 'c', meetingId: 'm3' }), options)
    ).resolves.toMatchObject({ status: 429, scope: 'workspace' });
    await expect(
      checkMeetAiUsage(
        chunk({ userId: 'c', meetingId: 'm4', workspaceId: 'ws-2' }),
        options
      )
    ).resolves.toEqual({ ok: true });
  });

  it('stops a user at their own cap before charging shared budgets', async () => {
    const guard = fakeGuard();
    const env = {
      MEET_AI_LIMIT_USER_MEETING_AUDIO_SECONDS_PER_10_MIN: '15',
      MEET_AI_LIMIT_MEETING_AUDIO_SECONDS_PER_10_MIN: '30',
    };
    const options = { selection: guard.selection, env, now: guard.now };
    await checkMeetAiUsage(chunk({ userId: 'greedy' }), options);
    for (let i = 0; i < 3; i++)
      await expect(
        checkMeetAiUsage(chunk({ userId: 'greedy' }), options)
      ).resolves.toMatchObject({ status: 429, scope: 'user' });
    // The meeting still has 15 s for someone else.
    await expect(
      checkMeetAiUsage(chunk({ userId: 'other' }), options)
    ).resolves.toEqual({ ok: true });
  });

  it('limits notes runs per user, meeting and workspace', async () => {
    const guard = fakeGuard();
    const options = {
      selection: guard.selection,
      env: { MEET_AI_LIMIT_USER_MEETING_NOTES_PER_HOUR: '1' },
      now: guard.now,
    };
    const notes = chunk({ kind: 'notes', audioSeconds: undefined });
    await expect(checkMeetAiUsage(notes, options)).resolves.toEqual({
      ok: true,
    });
    await expect(checkMeetAiUsage(notes, options)).resolves.toMatchObject({
      status: 429,
      scope: 'user',
    });
  });

  it.each([
    ['legacy', { kind: 'legacy' }],
    ['off', { kind: 'off' }],
  ] as const)(
    'fails closed when the store is %s',
    async (reason, selection) => {
      await expect(
        checkMeetAiUsage(chunk(), {
          selection: selection as AbuseGuardSelection,
        })
      ).resolves.toEqual({
        ok: false,
        status: 503,
        code: 'MEET_AI_LIMITER_UNAVAILABLE',
        retryAfterSeconds: 30,
        reason,
      });
    }
  );

  it('fails closed when the store errors, times out or is stopped', async () => {
    for (const error of [
      new AbuseGuardUnavailableError('timeout'),
      new AbuseGuardUnavailableError('guard_stopped'),
      new AbuseGuardUnavailableError('guard_limited'),
      new Error('binding exploded'),
    ]) {
      const client = {
        family: 'meet',
        hitWindows: vi.fn().mockRejectedValue(error),
      } as unknown as AbuseGuardClient;
      await expect(
        checkMeetAiUsage(chunk(), {
          selection: { kind: 'durable-object', client },
        })
      ).resolves.toMatchObject({ ok: false, status: 503 });
    }
  });

  it('fails closed for a client of another family', async () => {
    const guard = fakeGuard('offline');
    await expect(
      checkMeetAiUsage(chunk(), { selection: guard.selection })
    ).resolves.toMatchObject({ status: 503, reason: 'wrong_family' });
    expect(guard.calls).toHaveLength(0);
  });

  it.each([
    ['missing audio seconds', chunk({ audioSeconds: undefined })],
    ['zero audio seconds', chunk({ audioSeconds: 0 })],
    ['NaN audio seconds', chunk({ audioSeconds: Number.NaN })],
    ['blank user', chunk({ userId: ' ' })],
    ['blank workspace', chunk({ workspaceId: '' })],
  ])('fails closed on %s without calling the store', async (_, input) => {
    const guard = fakeGuard();
    await expect(
      checkMeetAiUsage(input, { selection: guard.selection })
    ).resolves.toMatchObject({ status: 503, reason: 'invalid_input' });
    expect(guard.calls).toHaveLength(0);
  });
});
