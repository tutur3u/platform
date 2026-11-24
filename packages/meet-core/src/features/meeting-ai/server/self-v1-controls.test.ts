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
vi.mock('./self-v1-access', () => ({ meetSelfAccess: mocks.selfAccess }));
vi.mock('./self-v1-outbox', () => ({ drainSelfOutbox: mocks.drain }));
vi.mock('./transcription-availability', () => ({
  readMeetTranscriptionAvailability: mocks.availability,
}));
vi.mock('./per-speaker-flag', () => ({ meetPerSpeakerEnabled: mocks.flag }));

import { meetAiResponse } from './access';
import {
  chooseSelfTranscript,
  readSelfConsentExtras,
  setSelfMode,
} from './self-v1-controls';

const meetingId = '00000000-0000-4000-8000-0000000000dd';
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const params = { params: Promise.resolve({ wsId: 'w', meetingId }) };
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
    expect(result).toEqual({ available: true, choice: 'decline' });
    expect(mocks.selfAccess).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('protocol', 'self_v1');
    expect(mocks.drain).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      sessionId,
      pending
    );
  });

  it('runs the uploader check before an allow reaches the room', async () => {
    mocks.selfAccess.mockRejectedValue(
      Object.assign(new Error('no'), { status: 403 })
    );
    await expect(
      chooseSelfTranscript(post({ choice: 'allow' }), params)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.room).not.toHaveBeenCalled();
  });
});

describe('transcript-consent extras', () => {
  it('reports mode, availability, session and mode rights', async () => {
    mocks.access.isHost = true;
    expect(
      await readSelfConsentExtras(mocks.access as never, {
        mode: 'self',
        session: { sessionId, protocol: 'self_v1' },
      })
    ).toEqual({
      mode: 'self',
      perSpeakerAvailable: true,
      session: { sessionId, protocol: 'self_v1' },
      canManageMode: true,
    });
  });

  it('defaults to room mode and never lets a guest manage it', async () => {
    expect(
      await readSelfConsentExtras(
        { ...mocks.access, guest: true } as never,
        {}
      )
    ).toEqual({
      mode: 'room',
      perSpeakerAvailable: true,
      session: null,
      canManageMode: false,
    });
  });
});
