// @vitest-environment node
import {
  EASY_CENTER_TUTORING_POLICY,
  readTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  like: vi.fn(async () => ({ data: [], error: null })),
  upsert: vi.fn(
    async (
      _rows: { id: string; value: string; ws_id: string }[],
      _options?: { onConflict: string }
    ) => ({ error: null })
  ),
};

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.resolveAccess,
}));

async function request(method: 'GET' | 'PUT', body?: unknown) {
  const route = await import('./route');
  return route[method](
    new Request(`http://localhost/api/v1/workspaces/${wsId}/tutoring/policy`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ wsId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({ from: () => query });
});

describe('tutoring policy API', () => {
  it('returns safe defaults when the workspace has no custom policy', async () => {
    const response = await request('GET');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isConfigured: false,
      policy: { durationMinutes: 45, leadMinutes: 45 },
    });
    expect(query.eq).toHaveBeenCalledWith('ws_id', wsId);
  });

  it('rejects invalid settings before writing', async () => {
    const response = await request('PUT', {
      ...EASY_CENTER_TUTORING_POLICY,
      leadMinutes: -1,
    });
    expect(response.status).toBe(400);
    expect(query.upsert).not.toHaveBeenCalled();
  });

  it('requires settings permission to save', async () => {
    mocks.resolveAccess.mockResolvedValue({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => true },
    });
    expect((await request('PUT', EASY_CENTER_TUTORING_POLICY)).status).toBe(
      403
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('stores a validated policy in the authorized workspace', async () => {
    const response = await request('PUT', EASY_CENTER_TUTORING_POLICY);
    expect(response.status).toBe(200);
    expect(query.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ ws_id: wsId })]),
      { onConflict: 'ws_id,id' }
    );
    const saved = query.upsert.mock.calls[0]?.[0] ?? [];
    expect(
      saved.every((row: { value: string }) => row.value.length <= 1000)
    ).toBe(true);
    expect(readTutoringPolicyConfigRows(saved)).toMatchObject(
      EASY_CENTER_TUTORING_POLICY
    );
  });
});
