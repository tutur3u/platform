import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({ access: vi.fn(), generate: vi.fn() }));
vi.mock('server-only', () => ({}));
// Authorization is covered separately; avoid loading built auth packages here.
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  generateMeetArtifact: mocks.generate,
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';

const id = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
function query(result: unknown) {
  const value = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  value.select.mockReturnValue(value);
  value.update.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  return value;
}
function request(audio = encodeMeetWav(new Float32Array(16000))) {
  const body = new FormData();
  body.set('id', id);
  body.set('sessionId', id);
  body.set('sequence', '0');
  body.set('startSeconds', '0');
  body.set('audio', audio, 'chunk.wav');
  return new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body,
  });
}
describe('Meet chunk idempotency', () => {
  beforeEach(() => vi.resetAllMocks());
  it('rejects malformed audio before touching transcript storage', async () => {
    const from = vi.fn();
    mocks.access.mockResolvedValue({
      db: { from },
      meetingId: id,
      user: { id },
    });
    expect(
      (
        await meetAiResponse(() =>
          transcribeMeetChunk(request(new Blob(['invalid'])), params)
        )
      ).status
    ).toBe(400);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('returns a completed duplicate without another provider charge', async () => {
    const existing = { id, status: 'completed', transcript: 'Already saved' };
    const from = vi
      .fn()
      .mockReturnValueOnce(query({ data: { id }, error: null }))
      .mockReturnValueOnce(query({ data: existing, error: null }));
    mocks.access.mockResolvedValue({
      db: { from },
      meetingId: id,
      user: { id },
    });
    expect(await transcribeMeetChunk(request(), params)).toEqual(existing);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('retries transcript persistence without repeating a paid Gemini call', async () => {
    const saved = { id, status: 'completed', transcript: 'Saved after retry' };
    const from = vi
      .fn()
      .mockReturnValueOnce(
        query({
          data: { id, created_at: new Date().toISOString() },
          error: null,
        })
      )
      .mockReturnValueOnce(query({ data: null, error: null }))
      .mockReturnValueOnce(query({ data: { ended_at: null }, error: null }))
      .mockReturnValueOnce(
        query({ data: null, error: { message: 'temporary failure' } })
      )
      .mockReturnValueOnce(query({ data: saved, error: null }));
    const rpc = vi
      .fn()
      .mockResolvedValue({
        data: { id, created_at: new Date().toISOString() },
        error: null,
      });
    mocks.access.mockResolvedValue({
      db: { from, rpc },
      meetingId: id,
      user: { id },
    });
    mocks.generate.mockResolvedValue({
      text: saved.transcript,
      usage: {},
      costUsd: 0.001,
    });
    expect(await transcribeMeetChunk(request(), params)).toEqual(saved);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'rejects stale reservations before provider start (ended: %s)',
    async (ended) => {
      const from = vi
        .fn()
        .mockReturnValueOnce(
          query({
            data: { id, created_at: new Date().toISOString() },
            error: null,
          })
        )
        .mockReturnValueOnce(query({ data: null, error: null }))
        .mockReturnValueOnce(
          query({
            data: { ended_at: ended ? new Date().toISOString() : null },
            error: null,
          })
        )
        .mockReturnValue(query({ data: null, error: null }));
      const rpc = vi.fn().mockResolvedValue({
        data: {
          id,
          created_at: new Date(Date.now() - 100_000).toISOString(),
        },
        error: null,
      });
      mocks.access.mockResolvedValue({
        db: { from, rpc },
        meetingId: id,
        user: { id },
      });
      expect(
        (await meetAiResponse(() => transcribeMeetChunk(request(), params)))
          .status
      ).toBe(409);
      expect(mocks.generate).not.toHaveBeenCalled();
    }
  );
  it.each([null, { id: null }])(
    'does not call Gemini when an atomic reservation loses a race (%j)',
    async (reservation) => {
      const existing = { id, status: 'processing' };
      const from = vi
        .fn()
        .mockReturnValueOnce(
          query({
            data: { id, created_at: new Date().toISOString() },
            error: null,
          })
        )
        .mockReturnValueOnce(query({ data: null, error: null }))
        .mockReturnValueOnce(query({ data: existing, error: null }));
      const rpc = vi.fn().mockResolvedValue({ data: reservation, error: null });
      mocks.access.mockResolvedValue({
        db: { from, rpc },
        meetingId: id,
        user: { id },
      });
      expect(await transcribeMeetChunk(request(), params)).toEqual(existing);
      expect(mocks.generate).not.toHaveBeenCalled();
    }
  );
});
