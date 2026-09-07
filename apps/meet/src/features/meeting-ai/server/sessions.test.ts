import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), generate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  generateMeetArtifact: mocks.generate,
  meetNotesSchema: { parse: (value: unknown) => value },
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { meetAiResponse } from './access';
import { changeMeetAi, readMeetAi } from './sessions';

const id = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
const session = {
  id,
  notes_status: 'pending',
  notes_unpriced_attempts: 0,
  ended_at: null,
};
function dbWith(results: unknown[]) {
  const writes: unknown[] = [];
  const from = vi.fn(() => {
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    for (const key of ['select', 'eq', 'in', 'order', 'range'])
      chain[key] = () => chain;
    chain.update = (value: unknown) => {
      writes.push(value);
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(result);
    chain.single = () => Promise.resolve(result);
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    chain.then = (
      resolve: (value: unknown) => void,
      reject: (reason: unknown) => void
    ) => Promise.resolve(result).then(resolve, reject);
    return chain;
  });
  mocks.access.mockResolvedValue({
    db: { from },
    meetingId: id,
    user: { id },
    canManage: true,
  });
  return writes;
}
const result = (data: unknown) => ({ data, error: null });
const request = () =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body: JSON.stringify({
      action: 'finish',
      sessionId: id,
      expectedChunks: 1,
    }),
  });
describe('Meet notes finalization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only');
  });
  it('does not regenerate completed notes', async () => {
    dbWith([result({ ...session, notes_status: 'completed' })]);
    expect(await changeMeetAi(request(), params)).toEqual({ sessionId: id });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('waits for reserved audio to finish before generating notes', async () => {
    dbWith([
      result(session),
      result(null),
      result([{ status: 'processing', created_at: new Date().toISOString() }]),
    ]);
    expect(
      (await meetAiResponse(() => changeMeetAi(request(), params))).status
    ).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('does not generate notes after losing the compare-and-set claim', async () => {
    dbWith([result(session), result(null), result([]), result(null)]);
    expect(
      (await meetAiResponse(() => changeMeetAi(request(), params))).status
    ).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('persists missing pricing as null instead of zero', async () => {
    const writes = dbWith([
      result(session),
      result(null),
      result([
        {
          status: 'completed',
          start_seconds: 0,
          transcript: 'We will ship tomorrow.',
        },
      ]),
      result({ id }),
      result({ id }),
    ]);
    mocks.generate.mockResolvedValue({
      notes: {
        incomplete: false,
        summary: 'Ship tomorrow',
        decisions: [],
        actionItems: [],
        openQuestions: [],
      },
      costUsd: null,
      usage: { available: false },
    });
    await changeMeetAi(request(), params);
    expect(writes.at(-1)).toMatchObject({
      notes_cost_usd: null,
      notes_status: 'completed',
    });
  });
  it('retains an unknown billable attempt after provider failure', async () => {
    const writes = dbWith([
      result(session),
      result(null),
      result([
        {
          status: 'completed',
          start_seconds: 0,
          transcript: 'Discuss release.',
        },
      ]),
      result({ id }),
      result({ id }),
    ]);
    mocks.generate.mockRejectedValue(new Error('Provider timeout'));
    expect(
      (await meetAiResponse(() => changeMeetAi(request(), params))).status
    ).toBe(500);
    expect(writes.at(-1)).toMatchObject({
      notes_status: 'failed',
      notes_unpriced_attempts: 1,
    });
  });
  it('shows failed transcription and notes attempts as unpriced in aggregate statistics', async () => {
    dbWith([
      result([
        {
          ...session,
          notes_unpriced_attempts: 2,
          notes: null,
          notes_cost_usd: null,
        },
      ]),
      result([{ id, status: 'failed', cost_usd: null, usage: null }]),
    ]);
    const state = await readMeetAi(request(), params);
    expect(state.unpricedRequests).toBe(3);
    expect(state.estimatedCostUsd).toBe(0);
  });
});
