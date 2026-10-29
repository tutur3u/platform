import { describe, expect, it, vi } from 'vitest';
import {
  beginFinalizationAttempt,
  dueFinalizations,
  finalizationDeadline,
  MEET_FINALIZE_FIRST_DELAY_MS,
  MEET_FINALIZE_MAX_ATTEMPTS,
  MEET_FINALIZE_MAX_RECORDS,
  settleFinalization,
} from './finalization';
import {
  deliverMeetFinalization,
  signMeetFinalizeToken,
  verifyMeetFinalizeToken,
} from './finalization-token';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { signMeetRealtimeToken } from './token';

const now = '2026-09-09T00:00:00Z';
const at = Date.parse(now);
const room = '11111111-1111-4111-8111-111111111111';
const session = '44444444-4444-4444-8444-444444444444';
const host = meetRealtimeTokenPayloadSchema.parse({
  userId: '33333333-3333-4333-8333-333333333333',
  accountId: '55555555-5555-4555-8555-555555555555',
  exp: 2000000000,
  role: 'host',
  scopes: getMeetRealtimeScopesForRole('host'),
  limits: {},
  meetingId: room,
  roomId: 'room',
  wsId: room,
});
const guest = {
  ...host,
  userId: '22222222-2222-4222-8222-222222222222',
  accountId: '66666666-6666-4666-8666-666666666666',
  role: 'speaker' as const,
  scopes: getMeetRealtimeScopesForRole('speaker'),
};
const quiet = {
  ...guest,
  userId: '77777777-7777-4777-8777-777777777777',
  accountId: '88888888-8888-4888-8888-888888888888',
};
const people = [host, guest, quiet];
const start = {
  type: 'transcription.state',
  state: {
    active: true,
    sessionId: session,
    startedBy: host.userId,
    language: 'auto',
    consentRequired: true,
  },
};
const stop = {
  type: 'transcription.state',
  state: { ...start.state, active: false },
};
type State = ReturnType<typeof createMeetRoomSnapshot>;
function run(state: State, message: unknown, actor = host) {
  return applyMeetRoomCommand(state, {
    message: meetRealtimeClientMessageSchema.parse(message),
    token: actor,
    now,
  }).state;
}
const consent = (state: State, actor: typeof host, allowed: boolean) =>
  run(
    state,
    { type: 'transcription.consent', userId: actor.userId, allowed },
    actor
  );
function active(options: { shareAfter?: boolean; share?: boolean } = {}) {
  let state = createMeetRoomSnapshot();
  for (const person of people) state = admitOrHold(state, person, now).state;
  state = {
    ...state,
    settings: {
      shareNotes: options.share ?? false,
      shareNotesAfterMeeting: options.shareAfter ?? false,
    },
  };
  state = run(state, start);
  state = consent(state, host, true);
  state = consent(state, guest, true);
  return consent(state, quiet, false);
}

describe('queueing a finalization', () => {
  it('queues the consented accounts when the host stops the session', () => {
    const state = run(active(), stop);
    expect(Object.keys(state.finalizations ?? {})).toEqual([session]);
    expect(state.finalizations?.[session]).toMatchObject({
      sessionId: session,
      meetingId: room,
      wsId: room,
      consentedAccountIds: [host.accountId, guest.accountId].sort(),
      attempts: 0,
      status: 'pending',
      nextAttemptAt: at + MEET_FINALIZE_FIRST_DELAY_MS,
    });
    // The declined participant is never in the list.
    expect(state.finalizations?.[session]?.consentedAccountIds).not.toContain(
      quiet.accountId
    );
  });

  it('queues when the room ends, before consent is cleared, once only', () => {
    const ended = run(active(), { type: 'room.end' });
    expect(ended.transcriptionConsents).toBeUndefined();
    expect(ended.finalizations?.[session]?.consentedAccountIds).toHaveLength(2);
    // Stopping then ending, or ending twice, never queues a second record.
    const stopped = run(active(), stop);
    const both = run(stopped, { type: 'room.end' });
    expect(Object.keys(both.finalizations ?? {})).toEqual([session]);
    expect(both.finalizations?.[session]).toEqual(
      stopped.finalizations?.[session]
    );
  });

  it('keeps a decision after the participant leaves and honours withdrawal', () => {
    let state = active();
    state = { ...state, presence: { ...state.presence } };
    delete state.presence[guest.userId];
    expect(
      run(state, stop).finalizations?.[session]?.consentedAccountIds
    ).toContain(guest.accountId);
    state = consent(active(), guest, false);
    expect(
      run(state, stop).finalizations?.[session]?.consentedAccountIds
    ).toEqual([host.accountId]);
  });

  it('queues nothing when nobody consented or no session is active', () => {
    let state = createMeetRoomSnapshot();
    for (const person of people) state = admitOrHold(state, person, now).state;
    state = consent(run(state, start), host, false);
    expect(run(state, stop).finalizations).toBeUndefined();
    expect(run(run(state, stop), stop).finalizations).toBeUndefined();
    expect(
      run(createMeetRoomSnapshot(), { type: 'room.end' }, host).finalizations
    ).toBeUndefined();
  });

  it('queues the old session when the host starts a different one', () => {
    const next = '99999999-9999-4999-8999-999999999999';
    const state = run(active(), {
      type: 'transcription.state',
      state: { ...start.state, sessionId: next },
    });
    expect(Object.keys(state.finalizations ?? {})).toEqual([session]);
    expect(state.transcriptionConsents?.sessionId).toBe(next);
  });

  it('lists readers only when the policy for the moment shares notes', () => {
    expect(
      run(active(), stop).finalizations?.[session]?.readerAccountIds
    ).toEqual([]);
    expect(
      run(active({ share: true }), stop).finalizations?.[session]
        ?.readerAccountIds
    ).toHaveLength(3);
    // Ending uses the after-meeting policy, which is off here.
    expect(
      run(active({ share: true }), { type: 'room.end' }).finalizations?.[
        session
      ]?.readerAccountIds
    ).toEqual([]);
    expect(
      run(active({ shareAfter: true }), { type: 'room.end' }).finalizations?.[
        session
      ]?.readerAccountIds
    ).toHaveLength(3);
  });
});

describe('the bounded attempt ledger', () => {
  const queued = () => run(active(), stop);
  it('spends the attempt and schedules the next one before delivering', () => {
    const state = queued();
    expect(dueFinalizations(state, at)).toEqual([]);
    expect(finalizationDeadline(state)).toBe(at + MEET_FINALIZE_FIRST_DELAY_MS);
    const due = at + MEET_FINALIZE_FIRST_DELAY_MS;
    const begun = beginFinalizationAttempt(state, session, due);
    expect(begun.record?.attempts).toBe(1);
    expect(begun.state.finalizations?.[session]?.nextAttemptAt).toBeGreaterThan(
      due
    );
    // The same instant cannot be claimed twice: a restart finds it not due.
    expect(
      beginFinalizationAttempt(begun.state, session, due).record
    ).toBeNull();
  });

  it('stops after the maximum attempts, however often it restarts', () => {
    let state = queued();
    let delivered = 0;
    let time = at;
    for (let i = 0; i < 50; i++) {
      time += 10 * 60_000;
      const begun = beginFinalizationAttempt(state, session, time);
      state = begun.state;
      if (!begun.record) continue;
      delivered++;
      state = settleFinalization(state, session, 'retry');
    }
    expect(delivered).toBe(MEET_FINALIZE_MAX_ATTEMPTS);
    expect(state.finalizations?.[session]?.status).toBe('abandoned');
    expect(finalizationDeadline(state)).toBeUndefined();
  });

  it('marks success and fatal answers terminal', () => {
    const state = queued();
    expect(
      settleFinalization(state, session, 'done').finalizations?.[session]
        ?.status
    ).toBe('done');
    expect(
      settleFinalization(state, session, 'fatal').finalizations?.[session]
        ?.status
    ).toBe('abandoned');
    expect(
      settleFinalization(state, session, 'retry').finalizations?.[session]
        ?.status
    ).toBe('pending');
  });

  it('bounds how many records one room keeps', () => {
    let state = createMeetRoomSnapshot();
    for (const person of people) state = admitOrHold(state, person, now).state;
    for (let i = 0; i < MEET_FINALIZE_MAX_RECORDS + 4; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      state = run(state, {
        type: 'transcription.state',
        state: { ...start.state, sessionId: id },
      });
      state = consent(state, host, true);
      state = run(state, stop);
    }
    expect(Object.keys(state.finalizations ?? {}).length).toBeLessThanOrEqual(
      MEET_FINALIZE_MAX_RECORDS
    );
  });
});

describe('the signed request', () => {
  const record = () => {
    const entry = run(active(), stop).finalizations?.[session];
    if (!entry) throw new Error('missing record');
    return entry;
  };
  it('verifies, expires and rejects tampering and join tokens', () => {
    const token = signMeetFinalizeToken(record(), 'secret', at);
    expect(verifyMeetFinalizeToken(token, 'secret', at)?.consented).toEqual(
      record().consentedAccountIds
    );
    expect(verifyMeetFinalizeToken(token, 'other', at)).toBeNull();
    expect(
      verifyMeetFinalizeToken(token, 'secret', at + 11 * 60_000)
    ).toBeNull();
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body!, 'base64url').toString()),
        consented: [quiet.accountId],
      })
    ).toString('base64url');
    expect(
      verifyMeetFinalizeToken(`${forged}.${signature}`, 'secret', at)
    ).toBe(null);
    const join = signMeetRealtimeToken(host, 'secret');
    expect(verifyMeetFinalizeToken(join, 'secret', at)).toBeNull();
  });

  it('delivers identifiers and consent only, never content', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const outcome = await deliverMeetFinalization(record(), {
      url: 'https://meet.example/api/meet-ai/finalize',
      secret: 'secret',
      now: at,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Response.json({ status: 'completed' });
      }) as unknown as typeof fetch,
    });
    expect(outcome).toBe('done');
    expect(calls[0]?.init.body).toBe('{}');
    const headers = calls[0]?.init.headers as Record<string, string>;
    const bearer = String(headers.Authorization).slice(7);
    const claims = verifyMeetFinalizeToken(bearer, 'secret', at)!;
    expect(Object.keys(claims).sort()).toEqual([
      'aud',
      'consented',
      'exp',
      'meetingId',
      'readers',
      'sessionId',
      'wsId',
    ]);
  });

  it.each([
    [200, { status: 'completed' }, 'done'],
    [200, { status: 'abandoned' }, 'done'],
    [200, { status: 'pending' }, 'retry'],
    [401, {}, 'fatal'],
    [403, {}, 'fatal'],
    [400, {}, 'fatal'],
    [404, {}, 'retry'],
    [429, {}, 'retry'],
    [503, {}, 'retry'],
  ])('maps HTTP %s %j to %s', async (status, body, expected) => {
    expect(
      await deliverMeetFinalization(record(), {
        url: 'https://meet.example/f',
        secret: 'secret',
        now: at,
        fetch: (async () =>
          Response.json(body, { status })) as unknown as typeof fetch,
      })
    ).toBe(expected);
  });

  it('retries on a network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('down'));
    expect(
      await deliverMeetFinalization(record(), {
        url: 'https://meet.example/f',
        secret: 'secret',
        now: at,
        fetch: fetcher,
      })
    ).toBe('retry');
  });
});
