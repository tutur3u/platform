import { beforeEach, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  room: vi.fn(),
  verify: vi.fn(),
  generate: vi.fn(),
  credits: vi.fn(),
  usage: vi.fn(),
  consent: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./access', () => ({
  meetAiAccess: mocks.access,
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  getMeetCallAccess: mocks.room,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: mocks.verify,
}));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: mocks.credits }));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: mocks.usage }));

import { transcribeMeetChunk } from './chunks';

const id = '00000000-0000-4000-8000-000000000001';
const speakerId = '00000000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
const saved = { id, status: 'completed', transcript: 'Synthetic speech' };
function request(
  speaker: string | undefined = speakerId,
  audio = encodeMeetWav(new Float32Array(16000))
) {
  const body = new FormData();
  for (const [key, value] of Object.entries({
    id,
    sessionId: id,
    sequence: '0',
    startSeconds: '0',
  }))
    body.set(key, value);
  if (speaker) {
    body.set('speakerAccountId', speaker);
    body.set('sourceKind', 'microphone');
  }
  body.set('audio', audio, 'chunk.wav');
  return new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body,
  });
}
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.update.mockReturnValue(q);
  return q;
}
let reserve: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  const from = vi.fn((table: string) => {
    const q = query(
      table === 'users'
        ? { display_name: 'Synthetic speaker' }
        : table === 'user_private_details'
          ? { email: null }
          : table === 'meet_ai_sessions'
            ? { id, created_at: new Date().toISOString(), ended_at: null }
            : null
    );
    q.update.mockImplementation(() => query(saved));
    return q;
  });
  reserve = vi.fn().mockResolvedValue({ data: { id }, error: null });
  mocks.access.mockResolvedValue({
    db: { from, rpc: reserve, schema: vi.fn(() => ({ rpc: mocks.consent })) },
    meetingId: id,
    wsId: id,
    user: { id },
  });
  mocks.room.mockResolvedValue({ user: { id } });
  mocks.verify.mockResolvedValue({ accountId: speakerId });
  mocks.consent.mockResolvedValue({
    data: [{ revision: 1, decision: 'allow' }],
    error: null,
  });
  mocks.generate.mockResolvedValue({
    text: saved.transcript,
    usage: {},
    costUsd: 0,
  });
});
async function refused(req: Request, status = 403) {
  await expect(transcribeMeetChunk(req, params)).rejects.toMatchObject({
    status,
  });
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.usage).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
}
it('refuses a missing speaker before paid or provider work', async () => {
  await refused(request(''));
});
it.each(['deny', 'withdraw', null])(
  'refuses a speaker whose current legal consent is %s',
  async (decision) => {
    mocks.consent.mockResolvedValue({
      data: [{ revision: decision ? 2 : 0, decision }],
      error: null,
    });
    await refused(request());
  }
);
it('accepts a verified speaker with current allow consent from the canonical #7309 RPC', async () => {
  expect(await transcribeMeetChunk(request(), params)).toEqual(saved);
  expect(mocks.consent).toHaveBeenCalledWith('meet_ai_self_v1_consent_state', {
    p_session_id: id,
    p_account_id: speakerId,
  });
  expect(mocks.generate).toHaveBeenCalledOnce();
});
it('refuses creator replay of a stored PCM slice without a speaker', async () => {
  const storedSlice = new Blob(
    [await encodeMeetWav(new Float32Array(16000)).arrayBuffer()],
    { type: 'audio/wav' }
  );
  await refused(request('', storedSlice));
});
it('refuses an unverifiable account even when consent allows it', async () => {
  mocks.verify.mockResolvedValue({ accountId: id });
  await refused(request());
});
it('fails closed when the canonical consent source is unavailable', async () => {
  mocks.consent.mockResolvedValue({
    data: null,
    error: { message: 'unavailable' },
  });
  await refused(request(), 503);
});
it('fails closed when the canonical consent source has no row', async () => {
  mocks.consent.mockResolvedValue({ data: [], error: null });
  await refused(request());
});

it('rechecks withdrawal at provider handoff after successful admission', async () => {
  mocks.consent
    .mockResolvedValueOnce({
      data: [{ revision: 1, decision: 'allow' }],
      error: null,
    })
    .mockResolvedValueOnce({
      data: [{ revision: 2, decision: 'withdraw' }],
      error: null,
    });
  await expect(transcribeMeetChunk(request(), params)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.consent).toHaveBeenCalledTimes(2);
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('refuses an entire batch containing an unidentified shared-audio source', async () => {
  const body = new FormData();
  for (const [key, value] of Object.entries({
    id,
    sessionId: id,
    sequence: '0',
    startSeconds: '0',
  }))
    body.set(key, value);
  body.set(
    'sources',
    JSON.stringify([
      {
        speakerAccountId: speakerId,
        sourceKind: 'microphone',
        startSeconds: 0,
      },
      { sourceKind: 'shared_audio', startSeconds: 0 },
    ])
  );
  body.set('audio_0', encodeMeetWav(new Float32Array(16000)));
  body.set('audio_1', encodeMeetWav(new Float32Array(16000)));
  await refused(
    new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
      method: 'POST',
      headers: { 'x-meet-audio-batch': '1' },
      body,
    })
  );
});
