// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const { WS_ID, MEETING_ID, SESSION_ID, RECORDER_ID, HOST_ID } = vi.hoisted(
  () => ({
    WS_ID: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    MEETING_ID: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    SESSION_ID: 'c1f0a3e4-5b6d-4f7a-8b9c-0d1e2f3a4b5c',
    RECORDER_ID: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
    HOST_ID: '7d1c9a52-3f0e-4b6a-8c71-5a2e9f4d6b10',
  })
);
const ADMIN_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const MEMBER_ID = '3a4b5c6d-7e8f-4a1b-9c2d-0e1f2a3b4c5d';
const OUTSIDER_ID = '8f7e6d5c-4b3a-4291-8071-6f5e4d3c2b1a';

const mocks = vi.hoisted(() => ({
  userId: '',
  isMember: true,
  adminLookup: 'ok' as 'ok' | 'error',
  adminIds: new Set<string>(),
  chunkQuery: vi.fn(),
  signUrl: vi.fn(),
}));

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: mocks.userId },
    authError: null,
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: async () =>
    mocks.isMember ? { ok: true } : { ok: false, error: 'not_member' },
}));
vi.mock('@tuturuuu/supabase/next/server', () => {
  const rows: Record<string, unknown> = {
    workspace_meetings: { id: MEETING_ID, creator_id: HOST_ID },
    recording_sessions: {
      id: SESSION_ID,
      user_id: RECORDER_ID,
      status: 'completed',
    },
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order']) chain[name] = () => chain;
    chain.single = async () => ({ data: rows[table] });
    chain.maybeSingle = async () => ({ data: rows[table] });
    if (table === 'audio_chunks') {
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      chain.then = (resolve: (value: unknown) => void) => {
        mocks.chunkQuery();
        resolve({
          data: [
            {
              id: 'chunk-1',
              chunk_order: 0,
              created_at: '2026-10-30T00:00:00Z',
              storage_path: `${WS_ID}/recordings/${MEETING_ID}/${SESSION_ID}/0.webm`,
            },
          ],
          error: null,
        });
      };
    }
    return chain;
  };
  return {
    createClient: async () => ({
      from,
      rpc: async () =>
        mocks.adminLookup === 'error'
          ? { data: null, error: { message: 'down' } }
          : { data: mocks.adminIds.has(mocks.userId), error: null },
    }),
    createAdminClient: async () => ({
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => {
            mocks.signUrl(path);
            return { data: { signedUrl: `https://signed.test/${path}` } };
          },
        }),
      },
    }),
  };
});

import { GET } from './route';

async function play(userId: string) {
  mocks.userId = userId;
  const response = await GET(new Request('http://localhost/play') as never, {
    params: Promise.resolve({
      wsId: WS_ID,
      meetingId: MEETING_ID,
      sessionId: SESSION_ID,
    }),
  });
  return {
    status: response.status,
    body: (await response.json()) as { chunks?: { url: string }[] },
  };
}

beforeEach(() => {
  mocks.isMember = true;
  mocks.adminLookup = 'ok';
  mocks.adminIds = new Set([ADMIN_ID]);
  mocks.chunkQuery.mockReset();
  mocks.signUrl.mockReset();
});

it.each([
  ['the participant recorded on the session', RECORDER_ID],
  ['the meeting host', HOST_ID],
  ['a workspace admin', ADMIN_ID],
])('lists and signs audio for %s', async (_label, userId) => {
  const { status, body } = await play(userId);
  expect(status).toBe(200);
  expect(body.chunks).toHaveLength(1);
  expect(mocks.signUrl).toHaveBeenCalledTimes(1);
});

it('denies a member who did not take part, without listing or signing', async () => {
  const { status } = await play(MEMBER_ID);
  expect(status).toBe(403);
  expect(mocks.chunkQuery).not.toHaveBeenCalled();
  expect(mocks.signUrl).not.toHaveBeenCalled();
});

it('denies an outsider before any lookup', async () => {
  mocks.isMember = false;
  const { status } = await play(OUTSIDER_ID);
  expect(status).toBe(403);
  expect(mocks.chunkQuery).not.toHaveBeenCalled();
  expect(mocks.signUrl).not.toHaveBeenCalled();
});

it('fails closed when the admin lookup is unavailable', async () => {
  mocks.adminLookup = 'error';
  const { status } = await play(MEMBER_ID);
  expect(status).toBe(500);
  expect(mocks.signUrl).not.toHaveBeenCalled();
});

it('still lets the recorded participant listen when the admin lookup is down', async () => {
  mocks.adminLookup = 'error';
  expect((await play(RECORDER_ID)).status).toBe(200);
});
