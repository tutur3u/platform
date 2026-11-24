// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const MEMBER_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const LEGACY = '11111111-1111-4111-8111-111111111111';
const SELF = '22222222-2222-4222-8222-222222222222';
const SPEAKER = '33333333-3333-4333-8333-333333333333';

const originalFetch = globalThis.fetch;
const adminClient = vi.fn();
const meetingQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
meetingQuery.select.mockReturnValue(meetingQuery);
meetingQuery.eq.mockReturnValue(meetingQuery);

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
  connection: async () => undefined,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: { from: () => meetingQuery, rpc: vi.fn() },
    user: { id: MEMBER_ID },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => adminClient(),
}));

beforeEach(() => {
  process.env.MEET_REALTIME_TOKEN_SECRET = 'test-meet-review-secret';
  meetingQuery.maybeSingle.mockResolvedValue({
    data: { creator_id: HOST_ID, id: MEETING_ID },
    error: null,
  });
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ended: true, canReadNotes: true })
    ) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it('reads self_v1 sessions only through the read contracts for this reader', async () => {
  const chunkIn = vi.fn();
  const unknownCount = vi.fn();
  const sessions = {
    select: () => sessions,
    eq: () => sessions,
    order: () => sessions,
    range: async () => ({
      data: [
        {
          id: LEGACY,
          created_at: '2026-11-24T00:00:00Z',
          protocol: 'legacy',
          notes: null,
          notes_status: 'pending',
          notes_cost_usd: null,
          notes_unpriced_attempts: 0,
        },
        {
          id: SELF,
          created_at: '2026-11-24T01:00:00Z',
          protocol: 'self_v1',
          cost_settled_usd: 0.02,
          notes: { summary: 'raw notes must not leak' },
          notes_status: 'completed',
          notes_cost_usd: 0.01,
          notes_unpriced_attempts: 0,
        },
      ],
      error: null,
    }),
  };
  const chunks = {
    select: () => chunks,
    in: (...args: unknown[]) => {
      chunkIn(...args);
      return chunks;
    },
    order: () => chunks,
    range: async () => ({ data: [], error: null }),
    // Unknown-cost self_v1 chunks are counted, never read.
    eq: async (column: string, value: string) => {
      unknownCount(column, value);
      return { count: 2, error: null };
    },
  };
  const users = {
    select: () => users,
    in: async () => ({
      data: [{ id: SPEAKER, display_name: 'Current Name' }],
      error: null,
    }),
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === 'list_meet_ai_self_v1_segments')
      return {
        data: [
          {
            chunk_id: 'c1',
            account_id: SPEAKER,
            stream_id: 's1',
            sequence: 0,
            start_ms: 1500,
            end_ms: 3000,
            timing_uncertainty_ms: 0,
            transcript: 'contract text',
            is_own: false,
          },
        ],
        error: null,
      };
    if (name === 'get_meet_ai_self_v1_notes')
      return {
        data: [
          {
            notes_state: 'redacted',
            notes: null,
            notes_edited: null,
            transcript_revision: 1,
          },
        ],
        error: null,
      };
    return {
      data: [{ account_id: SPEAKER, coverage: 'contributing' }],
      error: null,
    };
  });
  adminClient.mockImplementation(() => ({
    from: (table: string) =>
      table === 'meet_ai_sessions'
        ? sessions
        : table === 'meet_ai_chunks'
          ? chunks
          : users,
    schema: () => ({ rpc }),
  }));

  const { GET } = await import('./route');
  const response = await GET(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/review`
    ),
    { params: Promise.resolve({ meetingId: MEETING_ID, wsId: WS_ID }) }
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  // Room-capture reads cover only legacy sessions.
  expect(chunkIn).toHaveBeenCalledWith('session_id', [LEGACY]);
  expect(body.sessions.map((s: { id: string }) => s.id)).toEqual([LEGACY]);
  for (const name of [
    'list_meet_ai_self_v1_segments',
    'get_meet_ai_self_v1_notes',
    'list_meet_ai_self_v1_coverage',
  ])
    expect(rpc).toHaveBeenCalledWith(
      name,
      expect.objectContaining({ p_session_id: SELF, p_reader_id: MEMBER_ID })
    );
  expect(body.selfSessions).toEqual([
    expect.objectContaining({
      id: SELF,
      protocol: 'self_v1',
      notesStatus: 'redacted',
      notes: null,
      coverage: [
        { accountId: SPEAKER, label: 'Current Name', contributing: true },
      ],
    }),
  ]);
  expect(body.selfChunks).toEqual([
    expect.objectContaining({
      sessionId: SELF,
      startSeconds: 1.5,
      transcript: 'contract text',
      speaker: expect.objectContaining({ label: 'Current Name' }),
    }),
  ]);
  expect(JSON.stringify(body)).not.toContain('raw notes must not leak');
  expect(unknownCount).toHaveBeenCalledWith('reservation_state', 'unknown');
});
