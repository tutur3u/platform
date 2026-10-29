import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, getPermissionsMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('../migration-export-auth', () => ({
  authorizeInfrastructureMigrationExport: getPermissionsMock,
}));

import { GET } from './route';

function createRequest(search = '?ws_id=workspace-1') {
  return new Request(
    `http://localhost/api/v1/infrastructure/lessons${search}`,
    {
      method: 'GET',
    }
  );
}

describe('infrastructure lessons route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects callers without target workspace migration permission before reading admin data', async () => {
    getPermissionsMock.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(getPermissionsMock).toHaveBeenCalledWith(request, 'workspace-1');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns private lessons for authorized migration operators', async () => {
    getPermissionsMock.mockResolvedValue({
      ok: true,
      value: { wsId: 'workspace-1', userId: 'actor' },
    });

    const queryResult = {
      count: 1,
      data: [{ id: 'lesson-1' }],
      error: null,
    };
    const queryBuilder = {
      eq: vi.fn(() => queryBuilder),
      range: vi.fn(async () => queryResult),
      select: vi.fn(() => queryBuilder),
    };
    const fromMock = vi.fn(() => queryBuilder);
    const schemaMock = vi.fn(() => ({
      from: fromMock,
    }));

    createAdminClientMock.mockResolvedValue({
      schema: schemaMock,
    });

    const response = await GET(createRequest('?ws_id=workspace-1&limit=5'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [{ id: 'lesson-1' }],
    });
    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(fromMock).toHaveBeenCalledWith('user_group_posts');
    expect(queryBuilder.select).toHaveBeenCalledWith(
      '*, workspace_user_groups!inner(ws_id)',
      { count: 'exact' }
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith(
      'workspace_user_groups.ws_id',
      'workspace-1'
    );
    expect(queryBuilder.range).toHaveBeenCalledWith(0, 4);
  });
});
