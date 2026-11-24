import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listWorkspaceExternalProjectRelationDefinitions: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/cache', () => ({
  EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL: 'private, no-store',
}));

vi.mock('@/lib/external-projects/store-relations', () => ({
  createWorkspaceExternalProjectRelationDefinition: vi.fn(),
  listWorkspaceExternalProjectRelationDefinitions: (
    ...args: Parameters<
      typeof mocks.listWorkspaceExternalProjectRelationDefinitions
    >
  ) => mocks.listWorkspaceExternalProjectRelationDefinitions(...args),
}));

const characters = '00000000-0000-4000-8000-0000000000c1';
const places = '00000000-0000-4000-8000-0000000000c2';

function get(query = '') {
  return new Request(
    `http://localhost/api/v1/workspaces/personal/external-projects/relation-definitions${query}`
  );
}

describe('external project relation definitions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: { role: 'admin-client' },
      normalizedWorkspaceId: 'ws-normalized',
      ok: true,
      user: { id: 'user-1' },
    });
    mocks.listWorkspaceExternalProjectRelationDefinitions.mockResolvedValue([
      { id: 'mentor', source_collection_id: characters },
      { id: 'located-in', source_collection_id: places },
    ]);
  });

  it('lists every definition of the caller workspace with read access', async () => {
    const { GET } = await import('./route');
    const response = await GET(get(), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(2);
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'read', wsId: 'personal' })
    );
    expect(
      mocks.listWorkspaceExternalProjectRelationDefinitions
    ).toHaveBeenCalledWith('ws-normalized', { role: 'admin-client' });
  });

  it('filters by source collection', async () => {
    const { GET } = await import('./route');
    const response = await GET(get(`?sourceCollectionId=${characters}`), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(await response.json()).toEqual([
      { id: 'mentor', source_collection_id: characters },
    ]);
  });

  it('matches a source collection id written in upper case', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      get(`?sourceCollectionId=${characters.toUpperCase()}`),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(await response.json()).toEqual([
      { id: 'mentor', source_collection_id: characters },
    ]);
  });

  it('refuses a malformed source collection id before reading', async () => {
    const { GET } = await import('./route');
    const response = await GET(get('?sourceCollectionId=nope'), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(400);
    expect(
      mocks.listWorkspaceExternalProjectRelationDefinitions
    ).not.toHaveBeenCalled();
  });

  it('returns the access refusal unchanged', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { GET } = await import('./route');
    const response = await GET(get(), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(403);
    expect(
      mocks.listWorkspaceExternalProjectRelationDefinitions
    ).not.toHaveBeenCalled();
  });
});
