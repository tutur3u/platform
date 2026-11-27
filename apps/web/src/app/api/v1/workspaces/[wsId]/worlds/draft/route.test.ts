import { createClient } from '@supabase/supabase-js';
import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from './route';

const { permissions, admin, transport } = vi.hoisted(() => ({
  permissions: vi.fn(),
  admin: vi.fn(),
  transport: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: admin,
}));

const workspaceId = '9dbb090f-e716-4836-82fe-1414174edd83';
const context = { params: Promise.resolve({ wsId: 'personal' }) };
const route = 'https://example.test/api/v1/workspaces/personal/worlds/draft';
const booth = edufestHall.objects[0]!;
const geometry = [{ ...booth, x: 10 }];

function save(revision: number, input: unknown = geometry) {
  return PUT(
    new Request(route, {
      method: 'PUT',
      body: JSON.stringify({ revision, geometry: input }),
    }),
    context
  );
}

function query(index: number) {
  const [url, options] = transport.mock.calls[index]!;
  return { url: new URL(url), options: options as RequestInit };
}

beforeEach(() => {
  vi.resetAllMocks();
  permissions.mockResolvedValue({
    wsId: workspaceId,
    containsPermission: (permission: string) =>
      permission === 'manage_workspace_settings',
  });
  admin.mockResolvedValue(
    createClient('https://database.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: transport },
    })
  );
});

describe('workspace Worlds draft API', () => {
  it('denies read and write before accessing storage', async () => {
    permissions.mockResolvedValueOnce(null).mockResolvedValueOnce({
      wsId: workspaceId,
      containsPermission: () => false,
    });
    expect((await GET(new Request(route), context)).status).toBe(403);
    expect((await save(0)).status).toBe(403);
    expect(admin).not.toHaveBeenCalled();
  });

  it('loads the sample at revision zero for a workspace with no draft', async () => {
    transport.mockResolvedValueOnce(Response.json([]));
    const request = new Request(route);
    const response = await GET(request, context);
    expect(permissions).toHaveBeenCalledWith({ wsId: 'personal', request });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      status: 'ok',
      draft: { revision: 0, world: edufestHall },
    });
    const { url, options } = query(0);
    expect(url.searchParams.get('ws_id')).toBe('eq.' + workspaceId);
    expect(url.searchParams.get('world_id')).toBe('eq.edufest-hall');
    expect(new Headers(options.headers).get('accept-profile')).toBe('private');
  });

  it('rejects invalid revisions, unknown and duplicate objects, and out-of-bounds geometry', async () => {
    expect((await save(-1)).status).toBe(400);
    expect((await save(0, [{ ...booth, id: 'other' }])).status).toBe(400);
    expect((await save(0, [booth, booth])).status).toBe(400);
    expect((await save(0, [{ ...booth, x: -1 }])).status).toBe(400);
    expect(
      (await save(0, [{ ...booth, ignored: 'a'.repeat(65_536) }])).status
    ).toBe(400);
    expect(admin).not.toHaveBeenCalled();
  });

  it('inserts revision one and stores only validated geometry overrides', async () => {
    transport.mockResolvedValueOnce(Response.json([{ revision: 1 }]));
    const response = await save(0, [
      { ...geometry[0], kind: 'fixture', assetId: 'injected' },
    ]);
    expect(response.status).toBe(200);
    expect((await response.json()).draft.world.objects[0]).toEqual({
      ...booth,
      x: 10,
    });
    const { url, options } = query(0);
    expect(url.searchParams.get('on_conflict')).toBe('ws_id,world_id');
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('prefer')).toContain(
      'resolution=ignore-duplicates'
    );
    expect(JSON.parse(String(options.body))).toEqual({
      ws_id: workspaceId,
      world_id: 'edufest-hall',
      revision: 1,
      geometry: [
        {
          id: booth.id,
          x: 10,
          z: booth.z,
          width: booth.width,
          depth: booth.depth,
          elevation: booth.elevation,
          heading: booth.heading,
        },
      ],
    });
  });

  it('updates by workspace, world and expected revision', async () => {
    transport.mockResolvedValueOnce(Response.json([{ revision: 6 }]));
    expect((await save(5)).status).toBe(200);
    const { url, options } = query(0);
    expect(options.method).toBe('PATCH');
    expect(url.searchParams.get('ws_id')).toBe('eq.' + workspaceId);
    expect(url.searchParams.get('world_id')).toBe('eq.edufest-hall');
    expect(url.searchParams.get('revision')).toBe('eq.5');
    expect(JSON.parse(String(options.body)).revision).toBe(6);
  });

  it.each([0, 5])(
    'reports the stored winner when revision %s loses the compare-and-set',
    async (revision) => {
      transport
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(
          Response.json([{ revision: 6, geometry: [{ ...booth, x: 8 }] }])
        );
      const response = await save(revision);
      const result = await response.json();
      expect(response.status).toBe(409);
      expect(result.status).toBe('stale');
      expect(result.draft.revision).toBe(6);
      expect(result.draft.world.objects[0].x).toBe(8);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(query(1).options.method).toBe('GET');
      expect(query(1).url.searchParams.get('ws_id')).toBe('eq.' + workspaceId);
    }
  );
});
