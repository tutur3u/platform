import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  credits: vi.fn(),
  generate: vi.fn(),
  enforce: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  meetNotesSchema: { parse: (value: unknown) => value },
}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: mocks.credits }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./transcript-speaker', () => ({
  resolveTranscriptSpeaker: async () => null,
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: mocks.enforce }));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { MeetAiError, meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';
import { changeMeetAi } from './sessions';

const id = '00000000-0000-4000-8000-000000000001';
const sessionUser = '00000000-0000-4000-8000-0000000000aa';
const meetingWorkspace = '00000000-0000-4000-8000-0000000000bb';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };

function chain(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const key of ['select', 'update', 'eq', 'in', 'order', 'range'])
    value[key] = vi.fn(() => value);
  value.maybeSingle = vi.fn().mockResolvedValue(result);
  value.single = vi.fn().mockResolvedValue(result);
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
  value.then = (resolve: (value: unknown) => void) =>
    Promise.resolve(result).then(resolve);
  return value;
}

function db(...results: unknown[]) {
  const from = vi.fn();
  for (const result of results) from.mockReturnValueOnce(chain(result));
  const rpc = vi.fn().mockResolvedValue({
    data: { id, attempt_id: id },
    error: null,
  });
  mocks.access.mockResolvedValue({
    db: { from, rpc },
    meetingId: id,
    wsId: meetingWorkspace,
    user: { id: sessionUser },
    canManage: true,
  });
  return { from, rpc };
}

function chunkRequest(extra: Record<string, string> = {}) {
  const body = new FormData();
  body.set('id', id);
  body.set('sessionId', id);
  body.set('sequence', '0');
  body.set('startSeconds', '1');
  // Client-supplied identity fields must never reach the limiter keys.
  for (const [key, value] of Object.entries(extra)) body.set(key, value);
  body.set('audio', encodeMeetWav(new Float32Array(16000 * 3)), 'chunk.wav');
  return new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body,
  });
}

const openSession = {
  data: { id, created_at: new Date().toISOString(), ended_at: null },
  error: null,
};
const noChunk = { data: null, error: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only');
});

describe('Meet chunk limiter', () => {
  it.each([
    [429, 'MEET_AI_RATE_LIMITED', 42],
    [503, 'MEET_AI_LIMITER_UNAVAILABLE', 30],
  ])(
    'refuses %i before any credit check, chunk row or provider call',
    async (status, code, retryAfter) => {
      const { rpc } = db(openSession, noChunk);
      mocks.enforce.mockRejectedValue(
        new MeetAiError(status, 'refused', code, retryAfter)
      );
      const response = await meetAiResponse(() =>
        transcribeMeetChunk(chunkRequest(), params)
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('Retry-After')).toBe(String(retryAfter));
      expect(await response.json()).toMatchObject({ code });
      expect(mocks.credits).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
    }
  );

  it('keys the limiter by the session user, meeting workspace and server audio seconds', async () => {
    db(openSession, noChunk);
    mocks.enforce.mockRejectedValue(new MeetAiError(429, 'refused'));
    await meetAiResponse(() =>
      transcribeMeetChunk(
        chunkRequest({
          userId: 'attacker',
          guestId: 'attacker',
          wsId: 'other',
          durationSeconds: '0.01',
        }),
        params
      )
    );
    expect(mocks.enforce).toHaveBeenCalledExactlyOnceWith({
      kind: 'chunk',
      userId: sessionUser,
      meetingId: id,
      workspaceId: meetingWorkspace,
      audioSeconds: 3,
    });
  });

  it('does not charge the limiter for an already completed chunk', async () => {
    const done = { id, status: 'completed' };
    db(openSession, { data: done, error: null });
    expect(await transcribeMeetChunk(chunkRequest(), params)).toEqual(done);
    expect(mocks.enforce).not.toHaveBeenCalled();
  });

  it('admits credits only after the limiter allows', async () => {
    const order: string[] = [];
    db(openSession, noChunk);
    mocks.enforce.mockImplementation(async () => {
      order.push('limit');
    });
    mocks.credits.mockImplementation(async () => {
      order.push('credits');
      throw new MeetAiError(402, 'no credits');
    });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(chunkRequest(), params)
    );
    expect(response.status).toBe(402);
    expect(order).toEqual(['limit', 'credits']);
  });
});

describe('Meet notes limiter', () => {
  const finish = () =>
    new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
      method: 'POST',
      body: JSON.stringify({
        action: 'finish',
        sessionId: id,
        expectedChunks: 1,
      }),
    });

  it('refuses before the notes claim and any provider call', async () => {
    const { from } = db(
      {
        data: {
          id,
          notes_status: 'pending',
          notes_unpriced_attempts: 0,
          ended_at: null,
        },
        error: null,
      },
      { data: null, error: null },
      { data: [], error: null }
    );
    mocks.enforce.mockRejectedValue(
      new MeetAiError(429, 'refused', 'MEET_AI_RATE_LIMITED', 60)
    );
    const response = await meetAiResponse(() => changeMeetAi(finish(), params));
    expect(response.status).toBe(429);
    expect(mocks.enforce).toHaveBeenCalledExactlyOnceWith({
      kind: 'notes',
      userId: sessionUser,
      meetingId: id,
      workspaceId: meetingWorkspace,
    });
    // Session lookup, end marker and chunk list only: no claim update.
    expect(from).toHaveBeenCalledTimes(3);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
