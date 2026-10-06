import { MeetAiGenerationError } from '@tuturuuu/ai/meetings/failure';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), generate: vi.fn() }));
vi.mock('server-only', () => ({}));
// Authorization is covered separately; avoid loading built auth packages here.
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
  const updatedTables: string[] = [];
  const predicates: Array<Array<[string, unknown]>> = [];
  const from = vi.fn((table: string) => {
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    const filters: Array<[string, unknown]> = [];
    predicates.push(filters);
    for (const key of ['select', 'eq', 'in', 'order', 'range'])
      chain[key] = () => chain;
    chain.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    };
    chain.update = (value: unknown) => {
      writes.push(value);
      updatedTables.push(table);
      return chain;
    };
    chain.maybeSingle = () =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
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
  return Object.assign(writes, { updatedTables, predicates });
}
const result = (data: unknown) => ({ data, error: null });
const request = (overrides: Record<string, unknown> = {}) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body: JSON.stringify({
      action: 'finish',
      sessionId: id,
      expectedChunks: 1,
      ...overrides,
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
  it.each([
    ['no chunks', []],
    [
      'blank mixed segments',
      [
        {
          status: 'completed',
          start_seconds: 0,
          transcript: 'Metadata fallback is not rendered speech.',
          usage: {
            segments: [
              {
                speaker: null,
                kind: 'microphone',
                startSeconds: 0,
                transcript: '   ',
              },
            ],
          },
        },
      ],
    ],
    [
      'failed audio',
      [{ status: 'failed', start_seconds: 0, transcript: null }],
    ],
    [
      'blank saved audio',
      [{ status: 'completed', start_seconds: 0, transcript: '   ' }],
    ],
  ])(
    'completes an ended incomplete retry with %s without billing',
    async (_label, chunks) => {
      const writes = dbWith([
        result({ ...session, ended_at: '2026-01-01T00:00:00Z' }),
        result(null),
        result(chunks),
        result({ id }),
        result({ id }),
      ]);
      await changeMeetAi(
        request({ expectedChunks: undefined, captureIncomplete: true }),
        params
      );
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(writes.at(-1)).toMatchObject({
        notes_status: 'completed',
        notes_usage: null,
        notes_cost_usd: 0,
        notes: {
          incomplete: true,
          summary: '',
          decisions: [],
          actionItems: [],
          openQuestions: [],
        },
      });
      expect(writes.updatedTables).toEqual([
        'meet_ai_sessions',
        'meet_ai_sessions',
        'meet_ai_sessions',
      ]);
    }
  );
  it.each([
    { transcript: 'Discuss the next release.' },
    {
      transcript: null,
      usage: {
        segments: [
          {
            speaker: null,
            kind: 'shared_audio',
            startSeconds: 0,
            transcript: 'Discuss the next release.',
          },
        ],
      },
    },
  ])(
    'still generates notes from real saved speech during an incomplete retry %#',
    async (speech) => {
      dbWith([
        result({ ...session, ended_at: '2026-01-01T00:00:00Z' }),
        result(null),
        result([
          {
            status: 'completed',
            start_seconds: 0,
            ...speech,
          },
        ]),
        result({ id }),
        result({ id }),
      ]);
      mocks.generate.mockResolvedValue({
        notes: null,
        usage: null,
        costUsd: 0,
      });
      await changeMeetAi(
        request({ expectedChunks: undefined, captureIncomplete: true }),
        params
      );
      expect(mocks.generate).toHaveBeenCalledOnce();
      expect(mocks.generate.mock.calls[0]?.[0].transcript).toContain(
        'Discuss the next release.'
      );
      expect(mocks.generate.mock.calls[0]?.[0].transcript).toContain(
        'This transcript is incomplete'
      );
    }
  );
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
  it('includes earlier charged attempts in the transcription breakdown', async () => {
    dbWith([
      result([session]),
      result([
        { id, status: 'completed', cost_usd: 0.5, prior_cost_usd: 0.25 },
      ]),
    ]);
    const state = await readMeetAi(request(), params);
    expect(state.transcriptionCostUsd).toBe(0.75);
    expect(state.estimatedCostUsd).toBe(0.75);
  });
});

it('redacts all costs and raw usage from a shared-notes reader', async () => {
  dbWith([
    result([
      {
        ...session,
        notes: null,
        notes_cost_usd: 7,
        notes_usage: { inputTokens: 999 },
        notes_unpriced_attempts: 1,
      },
    ]),
    result([
      {
        id: 'chunk',
        status: 'completed',
        transcript: 'Hello',
        cost_usd: 4,
        usage: { outputTokens: 200 },
      },
    ]),
  ]);
  const access = await mocks.access();
  mocks.access.mockResolvedValue({ ...access, canManage: false });
  const state = await readMeetAi(new Request('https://meet.test'), params);
  expect(state.estimatedCostUsd).toBeNull();
  expect(state.inputTokens).toBeNull();
  expect(state.outputTokens).toBeNull();
  expect(state.transcriptionCostUsd).toBeNull();
  expect(state.notesCostUsd).toBeNull();
  expect(state.chunks[0]).toMatchObject({
    transcript: 'Hello',
    cost_usd: null,
  });
  expect(state.chunks[0]).not.toHaveProperty('usage');
  expect(state.sessions[0]).toMatchObject({ notes_cost_usd: null });
  expect(state.sessions[0]).not.toHaveProperty('notes_usage');
  expect(state.sessions[0]).not.toHaveProperty('notes_unpriced_attempts');
});

it('retries failed ended-session notes from saved chunks without changing transcripts', async () => {
  const chunks = [
    {
      status: 'completed',
      start_seconds: 0,
      sequence: 0,
      transcript: 'Synthetic saved discussion.',
      usage: null,
    },
  ];
  const originalChunks = structuredClone(chunks);
  const firstWrites = dbWith([
    result(session),
    result(null),
    result(chunks),
    result({ id }),
    result({ id }),
  ]);
  mocks.generate.mockRejectedValueOnce(new MeetAiGenerationError('timeout'));
  const failed = await meetAiResponse(() => changeMeetAi(request(), params));
  expect(failed.status).toBe(502);
  expect(await failed.json()).toMatchObject({
    code: 'MEET_AI_PROVIDER_TIMEOUT',
  });
  expect(firstWrites.at(-1)).toMatchObject({ notes_status: 'failed' });
  expect(
    firstWrites.updatedTables.every((table) => table === 'meet_ai_sessions')
  ).toBe(true);
  const retryWrites = dbWith([
    result({
      ...session,
      ended_at: '2026-01-01T00:00:00.000Z',
      notes_status: 'failed',
      notes_unpriced_attempts: 1,
    }),
    result(null),
    result(chunks),
    result({ id }),
    result({ id }),
  ]);
  mocks.generate.mockResolvedValueOnce({
    notes: {
      summary: 'Synthetic recovered notes.',
      decisions: [],
      actionItems: [],
      openQuestions: [],
    },
    costUsd: 0,
    usage: { available: true },
  });
  expect(await changeMeetAi(request(), params)).toEqual({ sessionId: id });
  expect(mocks.generate.mock.calls.at(-1)?.[0]).toMatchObject({
    transcript: expect.stringContaining('Synthetic saved discussion.'),
  });
  expect(retryWrites.at(-1)).toMatchObject({
    notes_status: 'completed',
    notes: { summary: 'Synthetic recovered notes.' },
  });
  expect(
    retryWrites.updatedTables.every((table) => table === 'meet_ai_sessions')
  ).toBe(true);
  expect(chunks).toEqual(originalChunks);
});

describe('generated Meet notes persistence recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only');
  });
  it.each([
    [
      'returned storage error',
      { data: null, error: { message: 'Synthetic storage error' } },
    ],
    ['thrown storage error', new Error('Synthetic unknown commit')],
  ])(
    'reuses the generated result after %s without another provider call',
    async (_, failure) => {
      const chunks = [
        {
          status: 'completed',
          start_seconds: 0,
          sequence: 0,
          transcript: 'Synthetic saved speech.',
          usage: null,
        },
      ];
      const original = structuredClone(chunks);
      const writes = dbWith([
        result(session),
        result(null),
        result(chunks),
        result({ id }),
        failure,
        result({ id }),
      ]);
      const measured = {
        notes: {
          summary: 'Synthetic notes.',
          decisions: [],
          actionItems: [],
          openQuestions: [],
        },
        usage: { available: true, inputTokens: 10, outputTokens: 5 },
        costUsd: 0.25,
      };
      mocks.generate.mockResolvedValue(measured);
      expect(await changeMeetAi(request(), params)).toEqual({ sessionId: id });
      expect(mocks.generate).toHaveBeenCalledTimes(1);
      const attempt = (writes[1] as { notes_started_at: string })
        .notes_started_at;
      expect(writes.slice(2)).toEqual([
        {
          notes_status: 'completed',
          notes: { ...measured.notes, incomplete: false },
          notes_usage: measured.usage,
          notes_cost_usd: 0.25,
        },
        {
          notes_status: 'completed',
          notes: { ...measured.notes, incomplete: false },
          notes_usage: measured.usage,
          notes_cost_usd: 0.25,
        },
      ]);
      expect(writes.predicates.slice(4)).toEqual([
        [
          ['id', id],
          ['notes_started_at', attempt],
        ],
        [
          ['id', id],
          ['notes_started_at', attempt],
        ],
      ]);
      expect(chunks).toEqual(original);
      expect(
        writes.updatedTables.every((table) => table === 'meet_ai_sessions')
      ).toBe(true);
    }
  );
  it.each([
    [
      'returned errors',
      { data: null, error: { message: 'Synthetic private body' } },
    ],
    ['thrown errors', new Error('Synthetic private body')],
  ])(
    'bounds %s at three writes and reports no false completion',
    async (_, failure) => {
      const writes = dbWith([
        result(session),
        result(null),
        result([
          {
            status: 'completed',
            start_seconds: 0,
            transcript: 'Synthetic speech.',
          },
        ]),
        result({ id }),
        failure,
        failure,
        failure,
        result(null),
      ]);
      mocks.generate.mockResolvedValue({
        notes: { summary: 'Synthetic output.', actionItems: [] },
        usage: { available: true },
        costUsd: 0.5,
      });
      const response = await meetAiResponse(() =>
        changeMeetAi(request(), params)
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Could not save notes' });
      expect(mocks.generate).toHaveBeenCalledTimes(1);
      expect(writes.slice(2, 5)).toHaveLength(3);
      expect(writes[2]).toEqual(writes[3]);
      expect(writes[3]).toEqual(writes[4]);
      expect(writes.at(-1)).toEqual({
        notes_status: 'failed',
        notes_unpriced_attempts: 1,
      });
      const attempt = (writes[1] as { notes_started_at: string })
        .notes_started_at;
      expect(writes.predicates.slice(4, 7)).toEqual(
        Array.from({ length: 3 }, () => [
          ['id', id],
          ['notes_started_at', attempt],
        ])
      );
      expect(writes.predicates.at(-1)).toEqual([
        ['id', id],
        ['notes_started_at', attempt],
        ['notes_status', 'processing'],
      ]);
    }
  );
  it('treats a missing CAS row as conflict without retrying or generating again', async () => {
    const writes = dbWith([
      result(session),
      result(null),
      result([
        {
          status: 'completed',
          start_seconds: 0,
          transcript: 'Synthetic speech.',
        },
      ]),
      result({ id }),
      result(null),
      result(null),
    ]);
    mocks.generate.mockResolvedValue({
      notes: { summary: 'Synthetic output.', actionItems: [] },
      usage: { available: true },
      costUsd: 0.5,
    });
    const response = await meetAiResponse(() =>
      changeMeetAi(request(), params)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Notes finalization changed',
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(4);
    expect(writes.predicates.at(-1)).toContainEqual([
      'notes_status',
      'processing',
    ]);
  });
});
