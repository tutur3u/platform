import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  room: vi.fn(),
  setMode: vi.fn(),
  selfAccess: vi.fn(),
  availability: vi.fn(),
  flag: vi.fn(),
  admin: vi.fn(),
  drain: vi.fn(),
  notice: vi.fn(),
  resolveWs: vi.fn(),
  access: {
    isHost: false,
    canReadWorkspace: true,
    user: { id: 'u' },
    meeting: { id: 'm', ws_id: 'w' },
  } as Record<string, unknown>,
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('../../call/server/class-role', () => ({
  resolveMeetClassRole: mocks.role,
}));
vi.mock('../../call/server/room-service', () => ({
  callRoomService: mocks.room,
}));
vi.mock('./self-v1-room', async (original) => ({
  ...(await original<object>()),
  selfRoom: async () => ({ access: mocks.access, accountId: 'u' }),
  selfRoomCommands: { setMode: mocks.setMode },
}));
vi.mock('./self-v1-notice', () => ({ requireShownSelfNotice: mocks.notice }));
vi.mock('./self-v1-access', () => ({
  meetSelfAccess: mocks.selfAccess,
  resolveSelfWorkspace: mocks.resolveWs,
}));
vi.mock('./self-v1-outbox', () => ({ drainSelfOutbox: mocks.drain }));
vi.mock('./transcription-availability', () => ({
  readMeetTranscriptionAvailability: mocks.availability,
}));
vi.mock('./per-speaker-flag', () => ({ meetPerSpeakerEnabled: mocks.flag }));

import { MEET_TRANSCRIPT_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import { meetAiResponse } from './access';
import {
  chooseSelfTranscript,
  consentViewExtras,
  readSelfConsentExtras,
  selfModeConsentChoice,
  setSelfMode,
} from './self-v1-controls';

const meetingId = '00000000-0000-4000-8000-0000000000dd';
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const params = { params: Promise.resolve({ wsId: 'w', meetingId }) };
const allowBody = {
  choice: 'allow',
  noticeVersion: MEET_TRANSCRIPT_NOTICE_VERSION,
  locale: 'vi',
  textHash: 'a'.repeat(64),
};
const post = (body: unknown) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/w/m/self/x', {
    method: 'POST',
    headers: { origin: 'https://meet.tuturuuu.com' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.isHost = false;
  mocks.user.mockResolvedValue({ id: 'u' });
  mocks.role.mockResolvedValue({ coHost: true });
  mocks.availability.mockResolvedValue({ available: true });
  mocks.flag.mockResolvedValue(true);
  mocks.setMode.mockResolvedValue({ mode: 'self' });
  mocks.drain.mockResolvedValue(undefined);
  mocks.resolveWs.mockResolvedValue('w');
});

describe('capture mode setter', () => {
  it('lets a co-host choose per-speaker capture', async () => {
    expect(await setSelfMode(post({ mode: 'self' }), params)).toEqual({
      mode: 'self',
    });
    expect(mocks.setMode).toHaveBeenCalledWith(expect.anything(), 'self', {
      coHost: true,
    });
  });

  it('refuses anyone who is not host or co-host', async () => {
    mocks.role.mockResolvedValue({ coHost: false });
    const response = await meetAiResponse(() =>
      setSelfMode(post({ mode: 'room' }), params)
    );
    expect(response.status).toBe(403);
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('refuses per-speaker mode when the flag or allowlist is off', async () => {
    mocks.flag.mockResolvedValue(false);
    const response = await meetAiResponse(() =>
      setSelfMode(post({ mode: 'self' }), params)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'MEET_SELF_UNAVAILABLE',
    });
  });

  it('still allows switching back to room capture with the flag off', async () => {
    mocks.flag.mockResolvedValue(false);
    mocks.setMode.mockResolvedValue({ mode: 'room' });
    expect(await setSelfMode(post({ mode: 'room' }), params)).toEqual({
      mode: 'room',
    });
  });
});

describe('per-speaker transcript choice', () => {
  it('records a decline for anyone and drains this meeting self_v1 entries', async () => {
    const pending = [{ sessionId, accountId: 'u', seq: 3, kind: 'withdraw' }];
    mocks.room.mockResolvedValue({ choice: 'decline', pending });
    const query = {
      select: vi.fn(() => query),
      in: vi.fn(() => query),
      eq: vi.fn(() => query),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [{ id: sessionId }] }),
    };
    mocks.admin.mockResolvedValue({ from: () => query });
    const result = await chooseSelfTranscript(
      post({ choice: 'decline' }),
      params
    );
    expect(result).toMatchObject({
      available: true,
      choice: 'decline',
      mode: 'room',
      perSpeakerAvailable: true,
    });
    // Other accounts' outbox entries never reach the browser.
    expect(result).not.toHaveProperty('pending');
    expect(mocks.selfAccess).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('protocol', 'self_v1');
    expect(mocks.drain).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      sessionId,
      pending
    );
  });

  it('answers a limited allow with 409 MEET_SELF_RATE_LIMITED', async () => {
    mocks.selfAccess.mockResolvedValue({ user: { id: 'u' } });
    mocks.room.mockRejectedValue(
      Object.assign(new Error('x'), { status: 429 })
    );
    const response = await meetAiResponse(() =>
      chooseSelfTranscript(post(allowBody), params)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'MEET_SELF_RATE_LIMITED',
    });
  });

  it('runs the uploader check before an allow reaches the room', async () => {
    mocks.selfAccess.mockRejectedValue(
      Object.assign(new Error('no'), { status: 403 })
    );
    await expect(
      chooseSelfTranscript(post(allowBody), params)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.room).not.toHaveBeenCalled();
  });
});

describe('per-speaker notice evidence', () => {
  it.each([
    ['no evidence', { choice: 'allow' }],
    ['an old notice', { ...allowBody, noticeVersion: 'old-notice' }],
    ['a bad hash', { ...allowBody, textHash: 'abc' }],
    ['a bad locale', { ...allowBody, locale: 'english' }],
    ['an extra field', { ...allowBody, accountId: 'other' }],
  ])('refuses an allow with %s before any check', async (_label, body) => {
    const response = await meetAiResponse(() =>
      chooseSelfTranscript(post(body), params)
    );
    expect(response.status).toBe(400);
    expect(mocks.selfAccess).not.toHaveBeenCalled();
    expect(mocks.room).not.toHaveBeenCalled();
  });

  it('refuses an allow whose hash does not match the shown notice text', async () => {
    mocks.selfAccess.mockResolvedValue({ user: { id: 'u' } });
    mocks.notice.mockRejectedValue(
      Object.assign(new Error('mismatch'), {
        status: 409,
        code: 'MEET_SELF_NOTICE_MISMATCH',
      })
    );
    await expect(
      chooseSelfTranscript(post(allowBody), params)
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.notice).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'vi', textHash: 'a'.repeat(64) })
    );
    // The uploader check (flag, allowlist, membership) runs first.
    expect(mocks.selfAccess).toHaveBeenCalledOnce();
    expect(mocks.room).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'MEET_SELF_NOTICE_REQUIRED'],
    [409, 'MEET_SELF_NOTICE_STALE'],
  ])('passes the room %i %s back to the client', async (status, code) => {
    mocks.selfAccess.mockResolvedValue({ user: { id: 'u' } });
    mocks.room.mockRejectedValue(
      Object.assign(new Error('room'), { status, code })
    );
    const response = await meetAiResponse(() =>
      chooseSelfTranscript(post(allowBody), params)
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });

  it('records a decline without checking the notice text', async () => {
    mocks.room.mockResolvedValue({ choice: 'decline' });
    await chooseSelfTranscript(post({ choice: 'decline' }), params);
    expect(mocks.notice).not.toHaveBeenCalled();
  });

  it('records a complete allow under the current notice', async () => {
    mocks.selfAccess.mockResolvedValue({ user: { id: 'u' } });
    mocks.room.mockResolvedValue({ choice: 'allow' });
    await chooseSelfTranscript(post(allowBody), params);
    expect(mocks.room).toHaveBeenCalledWith(mocks.access, {
      action: 'transcript.consent.choice',
      choice: 'allow',
      version: MEET_TRANSCRIPT_NOTICE_VERSION,
      notice: {
        locale: 'vi',
        textHash: 'a'.repeat(64),
        noticeVersion: MEET_TRANSCRIPT_NOTICE_VERSION,
      },
    });
  });
});

describe('legacy consent POST in a per-speaker room', () => {
  const roomAccess = mocks.access as never;
  const read = (mode: string) => (input: { action: string }) =>
    Promise.resolve(
      input.action === 'transcript.consent.read'
        ? { mode }
        : { choice: 'allow', mode, session: { sessionId, protocol: 'self_v1' } }
    );

  it('leaves room mode to the room-capture path', async () => {
    mocks.room.mockImplementation(read('room'));
    expect(
      await selfModeConsentChoice(post({}), roomAccess, 'allow')
    ).toBeNull();
    expect(mocks.room).toHaveBeenCalledTimes(1);
    expect(mocks.selfAccess).not.toHaveBeenCalled();
  });

  it('refuses an allow without the per-speaker notice evidence', async () => {
    mocks.room.mockImplementation(read('self'));
    const response = await selfModeConsentChoice(post({}), roomAccess, 'allow');
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      code: 'MEET_SELF_EVIDENCE_REQUIRED',
    });
    // Only the mode read reached the room; no choice was recorded.
    expect(mocks.room).toHaveBeenCalledTimes(1);
    expect(mocks.selfAccess).not.toHaveBeenCalled();
  });

  it('always records a decline, without the uploader check', async () => {
    mocks.room.mockImplementation(read('self'));
    const response = await selfModeConsentChoice(
      post({}),
      roomAccess,
      'decline'
    );
    expect(response?.status).toBe(200);
    expect(mocks.selfAccess).not.toHaveBeenCalled();
    expect(mocks.room).toHaveBeenLastCalledWith(
      roomAccess,
      expect.objectContaining({ choice: 'decline' })
    );
  });
});

describe('transcript-consent extras', () => {
  it('reports mode, availability, session, mode rights and coverage', async () => {
    mocks.access.isHost = true;
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { account_id: 'a', coverage: 'contributing' },
        { account_id: 'b', coverage: 'not_contributing' },
      ],
      error: null,
    });
    mocks.admin.mockResolvedValue({ schema: () => ({ rpc }) });
    expect(
      await readSelfConsentExtras(mocks.access as never, {
        mode: 'self',
        session: { sessionId, protocol: 'self_v1', generation: 2 },
        canManageMode: true,
      })
    ).toEqual({
      mode: 'self',
      perSpeakerAvailable: true,
      session: { sessionId, protocol: 'self_v1' },
      canManageMode: true,
      coverage: [
        { accountId: 'a', contributing: true },
        { accountId: 'b', contributing: false },
      ],
    });
    expect(rpc).toHaveBeenCalledWith('list_meet_ai_self_v1_coverage', {
      p_session_id: sessionId,
      p_reader_id: 'u',
    });
  });

  it('defaults to room mode and never lets a guest manage it', async () => {
    expect(
      await readSelfConsentExtras({ ...mocks.access, guest: true } as never, {
        canManageMode: true,
      })
    ).toEqual({
      mode: 'room',
      perSpeakerAvailable: true,
      session: null,
      canManageMode: false,
    });
  });

  it('omits coverage for a participant the room does not let manage', async () => {
    const extras = await readSelfConsentExtras(mocks.access as never, {
      mode: 'self',
      session: { sessionId, protocol: 'self_v1', generation: 2 },
      canManageMode: false,
    });
    expect(extras).not.toHaveProperty('coverage');
    expect(extras.canManageMode).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('falls back to room mode when the per-speaker read fails', async () => {
    mocks.flag.mockRejectedValue(new Error('down'));
    expect(
      await consentViewExtras(mocks.access as never, { mode: 'self' })
    ).toEqual({
      mode: 'room',
      perSpeakerAvailable: false,
      session: null,
      canManageMode: false,
    });
  });
});

describe('self control ordering', () => {
  it('authenticates before reading the body', async () => {
    mocks.user.mockResolvedValue(null);
    const request = new Request(
      'https://meet.tuturuuu.com/api/meet-ai/w/m/self/choice',
      {
        method: 'POST',
        headers: { origin: 'https://meet.tuturuuu.com' },
        body: 'not json',
      }
    );
    const response = await meetAiResponse(() =>
      chooseSelfTranscript(request, params)
    );
    expect(response.status).toBe(401);
    expect(mocks.resolveWs).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin request before anything else', async () => {
    const request = new Request(
      'https://meet.tuturuuu.com/api/meet-ai/w/m/self/mode',
      {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
        body: JSON.stringify({ mode: 'room' }),
      }
    );
    const response = await meetAiResponse(() => setSelfMode(request, params));
    expect(response.status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it.each(['choice', 'mode'])(
    'refuses a meeting outside the route workspace for %s',
    async (route) => {
      mocks.resolveWs.mockResolvedValue('another-workspace');
      const response = await meetAiResponse(() =>
        route === 'choice'
          ? chooseSelfTranscript(post({ choice: 'decline' }), params)
          : setSelfMode(post({ mode: 'room' }), params)
      );
      expect(response.status).toBe(404);
      expect(mocks.room).not.toHaveBeenCalled();
      expect(mocks.setMode).not.toHaveBeenCalled();
    }
  );

  it('checks the flag before the notice evidence on Allow', async () => {
    mocks.selfAccess.mockRejectedValue(
      Object.assign(new Error('off'), {
        status: 403,
        code: 'MEET_SELF_UNAVAILABLE',
      })
    );
    await expect(
      chooseSelfTranscript(post(allowBody), params)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.notice).not.toHaveBeenCalled();
  });
});
