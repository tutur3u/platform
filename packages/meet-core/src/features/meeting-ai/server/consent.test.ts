import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  callAccess: vi.fn(),
  roomService: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  getMeetCallAccess: mocks.callAccess,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: mocks.roomService,
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { MEET_CONSENT_NOTICE_VERSION } from '../consent/notice';
import { meetAiResponse } from './access';
import { readMeetConsentRoster, recordMeetConsent } from './consent';

const ws = '00000000-0000-4000-8000-0000000000aa';
const meeting = '00000000-0000-4000-8000-0000000000bb';
const session = '00000000-0000-4000-8000-0000000000cc';
const participant = '00000000-0000-4000-8000-0000000000dd';
const someoneElse = '00000000-0000-4000-8000-0000000000ee';
const params = { params: Promise.resolve({ wsId: ws, meetingId: meeting }) };

function post(body: unknown, origin = 'https://meet.tuturuuu.com') {
  return new Request('https://meet.tuturuuu.com/api/meet-ai/x/y/consent', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function database(sessionRow: unknown, ownRows: unknown[] = []) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const log = {
    insert,
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: ownRows, error: null }),
  };
  log.select.mockReturnValue(log);
  log.eq.mockReturnValue(log);
  log.order.mockReturnValue(log);
  const lookup = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: sessionRow, error: null }),
  };
  lookup.select.mockReturnValue(lookup);
  lookup.eq.mockReturnValue(lookup);
  const db = {
    from: vi.fn(() => lookup),
    schema: vi.fn(() => ({ from: vi.fn(() => log) })),
  };
  mocks.admin.mockResolvedValue(db);
  return { insert, db };
}

const allow = {
  sessionId: session,
  decision: 'allow',
  noticeVersion: MEET_CONSENT_NOTICE_VERSION,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.callAccess.mockResolvedValue({
    user: { id: participant },
    meeting: { id: meeting, ws_id: ws },
  });
  mocks.roomService.mockResolvedValue({});
});

describe('consent POST', () => {
  it('rejects a cross-origin write', async () => {
    const { insert } = database(null);
    const response = await meetAiResponse(() =>
      recordMeetConsent(post(allow, 'https://evil.example'), params)
    );
    expect(response.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not admitted to the room', async () => {
    const { insert } = database({ id: session, created_at: new Date() });
    mocks.roomService.mockRejectedValue(
      Object.assign(new Error('no'), { status: 403 })
    );
    const response = await meetAiResponse(() =>
      recordMeetConsent(post(allow), params)
    );
    expect(response.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it('records the verified session user, never a client-supplied id', async () => {
    const { insert } = database({
      id: session,
      created_at: new Date().toISOString(),
      ended_at: null,
    });
    const response = await meetAiResponse(() =>
      recordMeetConsent(post({ ...allow, userId: someoneElse }), params)
    );
    expect(response.status).toBe(200);
    expect(mocks.roomService).toHaveBeenCalledWith(expect.anything(), {
      action: 'read',
    });
    expect(insert).toHaveBeenCalledWith({
      session_id: session,
      user_id: participant,
      decision: 'allow',
      notice_version: MEET_CONSENT_NOTICE_VERSION,
    });
  });

  it('does not accept a new allow for an ended session but records a decline', async () => {
    const { insert } = database({
      id: session,
      created_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    });
    const ended = await meetAiResponse(() =>
      recordMeetConsent(post(allow), params)
    );
    expect(ended.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
    await recordMeetConsent(post({ ...allow, decision: 'deny' }), params);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'deny', user_id: participant })
    );
  });

  it('rejects a notice version other than the one this server shows (F4)', async () => {
    const { insert } = database({
      id: session,
      created_at: new Date().toISOString(),
      ended_at: null,
    });
    for (const noticeVersion of ['meet-transcription-v1-draft', 'forged']) {
      const response = await meetAiResponse(() =>
        recordMeetConsent(post({ ...allow, noticeVersion }), params)
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'MEET_AI_CONSENT_NOTICE_OUTDATED',
      });
    }
    expect(mocks.roomService).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not append a repeated decision and bounds changes per session (F6)', async () => {
    const live = {
      id: session,
      created_at: new Date().toISOString(),
      ended_at: null,
    };
    const row = (decision: string, index: number) => ({
      id: String(index),
      user_id: participant,
      decision,
      created_at: new Date(Date.now() - 60_000 + index).toISOString(),
    });
    const repeated = database(live, [row('allow', 0)]);
    expect(await recordMeetConsent(post(allow), params)).toEqual({
      recorded: false,
      decision: 'allow',
    });
    expect(repeated.insert).not.toHaveBeenCalled();
    const flapping = database(
      live,
      Array.from({ length: 20 }, (_, index) =>
        row(index % 2 ? 'allow' : 'withdraw', index)
      ).reverse() // the log is read newest first
    );
    const response = await meetAiResponse(() =>
      recordMeetConsent(post({ ...allow, decision: 'withdraw' }), params)
    );
    expect(response.status).toBe(429);
    expect(flapping.insert).not.toHaveBeenCalled();
  });

  it('rejects a session from another meeting', async () => {
    const { insert } = database(null);
    const response = await meetAiResponse(() =>
      recordMeetConsent(post(allow), params)
    );
    expect(response.status).toBe(404);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('consent roster GET', () => {
  it('is limited to the host', async () => {
    mocks.access.mockResolvedValue({ canManage: false });
    const response = await meetAiResponse(() =>
      readMeetConsentRoster(
        new Request(`https://meet.tuturuuu.com/x?sessionId=${session}`),
        params
      )
    );
    expect(response.status).toBe(403);
  });
});
