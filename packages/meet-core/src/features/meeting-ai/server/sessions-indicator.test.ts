import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  generate: vi.fn(),
  indicator: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./credit-admission', () => ({
  admitMeetCredits: async () => ({ workspaceId: 'payer', allowance: {} }),
}));
// Entitlement and payer are covered by transcript-authority tests.
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: async () => ({
    payer: 'account',
    billingWorkspaceId: '00000000-0000-4000-8000-0000000000bb',
  }),
}));
vi.mock('./transcript-fence', () => ({
  requireMeetTranscriptFence: async () => {},
  recordMeetTranscriptSession: mocks.indicator,
}));
vi.mock('./transcript-roster', () => ({
  readTranscriptRoster: async () => new Map(),
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: async () => {} }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  meetNotesSchema: { parse: (value: unknown) => value },
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { MeetAiError, meetAiResponse } from './access';
import { changeMeetAi } from './sessions';

const id = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };

/** Each `from()` call answers with the next result; updates are recorded. */
function dbWith(results: unknown[]) {
  const writes: unknown[] = [];
  const from = vi.fn(() => {
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    for (const key of ['select', 'eq', 'in', 'order', 'range', 'insert'])
      chain[key] = () => chain;
    chain.update = (value: unknown) => {
      writes.push(value);
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(result);
    chain.single = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(result).then(resolve);
    return chain;
  });
  mocks.access.mockResolvedValue({
    db: { from },
    meetingId: id,
    wsId: id,
    user: { id },
    canManage: true,
  });
  return writes;
}
const result = (data: unknown) => ({ data, error: null });
const request = (body: object) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only');
});

it('shows everyone the indicator when the host starts', async () => {
  dbWith([result({ id })]);
  expect(await changeMeetAi(request({ action: 'start' }), params)).toEqual({
    sessionId: id,
  });
  expect(mocks.indicator).toHaveBeenCalledWith({
    meetingId: id,
    actorId: id,
    sessionId: id,
    active: true,
  });
});

it('ends a started session whose indicator could not be shown', async () => {
  const writes = dbWith([result({ id }), result(null)]);
  mocks.indicator.mockRejectedValue(new MeetAiError(503, 'room down'));
  const response = await meetAiResponse(() =>
    changeMeetAi(request({ action: 'start' }), params)
  );
  expect(response.status).toBe(503);
  expect(writes.at(-1)).toMatchObject({ ended_at: expect.any(String) });
});

it('clears the indicator when the host stops', async () => {
  dbWith([
    result({
      id,
      notes_status: 'pending',
      notes: null,
      notes_unpriced_attempts: 0,
      ended_at: null,
    }),
    result(null),
    result([]),
    result(null),
  ]);
  await meetAiResponse(() =>
    changeMeetAi(
      request({ action: 'finish', sessionId: id, expectedChunks: 0 }),
      params
    )
  );
  expect(mocks.indicator).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: id, active: false })
  );
});
