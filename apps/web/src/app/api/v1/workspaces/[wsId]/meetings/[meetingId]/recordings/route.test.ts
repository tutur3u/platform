// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const HOST_ID = '7d1c9a52-3f0e-4b6a-8c71-5a2e9f4d6b10';

const { RECORDER_ID, OTHER_ID } = vi.hoisted(() => ({
  RECORDER_ID: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  OTHER_ID: '4b320da6-6c8a-43fe-b1bf-09fbe77303f9',
}));
const mocks = vi.hoisted(() => ({
  userId: '',
  hostId: '',
  isAdmin: false,
  transcriptIn: vi.fn(),
}));

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/legacy-api-routes/head', () => ({
  createLegacyGetHandler: (handler: unknown) => handler,
  createLegacyHeadHandler: () => undefined,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: mocks.userId },
    authError: null,
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('../_lib/recording-access', () => ({
  canManageLegacyRecording: async () => mocks.isAdmin,
}));
vi.mock('@tuturuuu/supabase/next/server', () => {
  const sessions = [
    {
      id: 'recorded-by-recorder',
      user_id: RECORDER_ID,
      status: 'completed',
      created_at: '2026-10-30T00:00:00Z',
      updated_at: '2026-10-30T00:00:00Z',
    },
    {
      id: 'recorded-by-other',
      user_id: OTHER_ID,
      status: 'completed',
      created_at: '2026-10-30T00:00:00Z',
      updated_at: '2026-10-30T00:00:00Z',
    },
  ];
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'order', 'not', 'limit']) {
    chain[name] = () => chain;
  }
  chain.single = async () => ({
    data: { id: MEETING_ID, creator_id: mocks.hostId },
  });
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: sessions, error: null });
  return {
    createClient: async () => ({ from: () => chain }),
    createAdminClient: async () => ({
      schema: () => ({
        from: () => ({
          select: () => ({
            in: async (_column: string, ids: string[]) => {
              mocks.transcriptIn(ids);
              return {
                data: ids.map((id) => ({ session_id: id, text: `text:${id}` })),
                error: null,
              };
            },
          }),
        }),
      }),
    }),
  };
});

import { GET } from './route';

async function list(userId: string, isAdmin = false) {
  mocks.userId = userId;
  mocks.isAdmin = isAdmin;
  const response = await (
    GET as unknown as (...a: unknown[]) => Promise<Response>
  )(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/recordings`
    ),
    { params: Promise.resolve({ wsId: WS_ID, meetingId: MEETING_ID }) }
  );
  const body = (await response.json()) as {
    sessions: { id: string; transcript: { text: string } | null }[];
  };
  return Object.fromEntries(body.sessions.map((s) => [s.id, s.transcript]));
}

beforeEach(() => {
  mocks.transcriptIn.mockReset();
  mocks.hostId = HOST_ID;
});

it('returns a transcript to the identity recorded on that session', async () => {
  const transcripts = await list(RECORDER_ID);
  expect(transcripts['recorded-by-recorder']).toMatchObject({
    text: 'text:recorded-by-recorder',
  });
  expect(transcripts['recorded-by-other']).toBeNull();
  expect(mocks.transcriptIn).toHaveBeenCalledWith(['recorded-by-recorder']);
});

it('returns every transcript to a workspace admin', async () => {
  const transcripts = await list(`${OTHER_ID}-admin`, true);
  expect(transcripts['recorded-by-recorder']).not.toBeNull();
  expect(transcripts['recorded-by-other']).not.toBeNull();
});

it('hides transcripts from a member who recorded neither session', async () => {
  const transcripts = await list('3a4b5c6d-7e8f-4a1b-9c2d-0e1f2a3b4c5d');
  expect(transcripts).toEqual({
    'recorded-by-recorder': null,
    'recorded-by-other': null,
  });
  expect(mocks.transcriptIn).not.toHaveBeenCalled();
});

it('returns every transcript to the meeting host', async () => {
  const transcripts = await list(HOST_ID);
  expect(transcripts['recorded-by-recorder']).not.toBeNull();
  expect(transcripts['recorded-by-other']).not.toBeNull();
});
