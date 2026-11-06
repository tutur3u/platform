// @vitest-environment node
import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const otherWsId = '6e34398a-a1a5-4825-b9f1-eddf988575b1';
const groupId = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));
const rowsByWorkspace = new Map<string, { id: string; value: string }[]>();
let requestedWsId: string | undefined;
const query = {
  select: vi.fn(() => query),
  eq: vi.fn((_column: string, value: string) => {
    requestedWsId = value;
    return query;
  }),
  like: vi.fn(async () => ({
    data: rowsByWorkspace.get(requestedWsId ?? '') ?? [],
    error: null,
  })),
};

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock(
  '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared',
  () => ({ resolveTopicAnnouncementsAccess: mocks.resolveAccess })
);

async function request() {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/topic-announcements/campus-options`
    ),
    { params: Promise.resolve({ wsId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requestedWsId = undefined;
  rowsByWorkspace.clear();
  mocks.resolveAccess.mockResolvedValue({
    context: { normalizedWsId: wsId },
  });
  mocks.createAdminClient.mockResolvedValue({ from: () => query });
});

describe('topic announcement campus options API', () => {
  it('returns only the campus labels of the current workspace policy', async () => {
    rowsByWorkspace.set(
      wsId,
      serializeTutoringPolicyConfigRows({
        ...STANDARD_TUTORING_POLICY,
        campusByGroupId: { [groupId]: 'Legacy Annex' },
        campusOptions: ['Campus North'],
      })
    );
    rowsByWorkspace.set(
      otherWsId,
      serializeTutoringPolicyConfigRows({
        ...STANDARD_TUTORING_POLICY,
        campusOptions: ['Other Workspace Campus'],
      })
    );

    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: ['Campus North', 'Legacy Annex'],
    });
    expect(query.eq).toHaveBeenCalledWith('ws_id', wsId);
    expect(mocks.resolveAccess).toHaveBeenCalledWith(
      expect.any(Request),
      wsId,
      { requireManage: true }
    );
  });

  it('returns an empty list when the workspace has no policy', async () => {
    const response = await request();
    expect(await response.json()).toEqual({ data: [] });
  });

  it('stops at the topic announcement access gate', async () => {
    mocks.resolveAccess.mockResolvedValue({
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });
    expect((await request()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
