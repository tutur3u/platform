import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  generate: vi.fn(),
  startSelf: vi.fn(),
  finishSelf: vi.fn(),
  payer: vi.fn(),
  roomProtocol: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  meetNotesSchema: { parse: (value: unknown) => value },
}));
vi.mock('./transcript-roster', () => ({
  readTranscriptRoster: async () => new Map(),
}));
vi.mock('./transcription-availability', () => ({
  readMeetTranscriptionAvailability: async () => ({ available: true }),
}));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: mocks.payer,
}));
vi.mock('./transcript-fence', () => ({
  recordMeetTranscriptSession: async () => {},
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: async () => {} }));
vi.mock('./credit-admission', () => ({ admitMeetCredits: async () => ({}) }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./self-v1-session', () => ({
  roomCaptureProtocol: mocks.roomProtocol,
  startSelfSession: mocks.startSelf,
  finishSelfSession: mocks.finishSelf,
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { draftMeetAiNotes } from './draft-notes';
import { changeMeetAi, readMeetAi } from './sessions';

const legacy = '00000000-0000-4000-8000-0000000000a1';
const self = '00000000-0000-4000-8000-0000000000a2';
const params = { params: Promise.resolve({ wsId: 'w', meetingId: 'm' }) };
function chain(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'order', 'update', 'insert'])
    value[key] = vi.fn(() => value);
  value.in = vi.fn(() => value);
  value.range = vi.fn().mockResolvedValue(result);
  value.maybeSingle = vi.fn().mockResolvedValue(result);
  value.single = vi.fn().mockResolvedValue(result);
  return value;
}
const post = (body: unknown) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/w/m', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test';
});

describe('room-capture paths read only legacy sessions', () => {
  it('omits self_v1 sessions and their chunks from the session read', async () => {
    const chunks = chain({ data: [], error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chain({
          data: [
            { id: legacy, protocol: 'legacy', notes: null },
            { id: self, protocol: 'self_v1', notes: null },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(chunks);
    mocks.access.mockResolvedValue({
      db: { from },
      meetingId: 'm',
      wsId: 'w',
      canManage: true,
    });
    const state = await readMeetAi(new Request('https://x'), params);
    expect(state.sessions.map((session) => session.id)).toEqual([legacy]);
    expect(chunks.in).toHaveBeenCalledWith('session_id', [legacy]);
  });

  it('refuses live draft notes for a self_v1 session', async () => {
    const from = vi
      .fn()
      .mockReturnValue(
        chain({ data: { id: self, ended_at: null, protocol: 'self_v1' } })
      );
    await expect(
      draftMeetAiNotes({
        db: { from } as never,
        meetingId: 'm',
        wsId: 'w',
        userId: 'host',
        sessionId: self,
        meetingStartedAt: new Date().toISOString(),
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'MEET_SELF_PROTOCOL_MISMATCH',
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('routes a self_v1 finish to the per-speaker notes, never the room path', async () => {
    const from = vi.fn().mockReturnValue(
      chain({
        data: { id: self, protocol: 'self_v1', notes_status: 'pending' },
        error: null,
      })
    );
    mocks.access.mockResolvedValue({
      db: { from },
      meetingId: 'm',
      wsId: 'w',
      user: { id: 'host' },
      meetingStartedAt: new Date().toISOString(),
    });
    mocks.finishSelf.mockResolvedValue({ sessionId: self });
    expect(
      await changeMeetAi(post({ action: 'finish', sessionId: self }), params)
    ).toEqual({ sessionId: self });
    expect(mocks.finishSelf).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('starts a self_v1 session only through the per-speaker branch', async () => {
    const from = vi.fn();
    mocks.access.mockResolvedValue({
      db: { from },
      meetingId: 'm',
      wsId: 'w',
      user: { id: 'host' },
    });
    mocks.startSelf.mockResolvedValue({ sessionId: self, protocol: 'self_v1' });
    expect(
      await changeMeetAi(post({ action: 'start', protocol: 'self_v1' }), params)
    ).toEqual({ sessionId: self, protocol: 'self_v1' });
    expect(mocks.startSelf).toHaveBeenCalledWith({
      db: { from },
      meetingId: 'm',
      wsId: 'w',
      hostId: 'host',
    });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.payer).not.toHaveBeenCalled();
  });

  it('takes the protocol from the room mode when the host names none', async () => {
    mocks.access.mockResolvedValue({
      db: { from: vi.fn() },
      meetingId: 'm',
      wsId: 'w',
      user: { id: 'host' },
    });
    mocks.roomProtocol.mockResolvedValue('self_v1');
    mocks.startSelf.mockResolvedValue({ sessionId: self, protocol: 'self_v1' });
    expect(await changeMeetAi(post({ action: 'start' }), params)).toEqual({
      sessionId: self,
      protocol: 'self_v1',
    });
    expect(mocks.roomProtocol).toHaveBeenCalledWith('m', 'host');
  });

  it('always names the protocol of a room-capture start', async () => {
    const insert = chain({ data: { id: legacy }, error: null });
    mocks.access.mockResolvedValue({
      db: { from: () => insert },
      meetingId: 'm',
      wsId: 'w',
      user: { id: 'host' },
    });
    mocks.roomProtocol.mockResolvedValue('legacy');
    mocks.payer.mockResolvedValue({ billingWorkspaceId: 'w' });
    expect(await changeMeetAi(post({ action: 'start' }), params)).toEqual({
      sessionId: legacy,
      protocol: 'legacy',
    });
    expect(mocks.startSelf).not.toHaveBeenCalled();
  });
});
