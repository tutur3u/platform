// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  createAdminClient: vi.fn(),
  client: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: f.getPermissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.createAdminClient,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: Request,
        auth: { user: { id: string }; supabase: ReturnType<typeof f.client> },
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
    async (
      request: Request,
      context: { params: Promise<{ wsId: string }> }
    ) => {
      const id = request.headers.get('x-test-user');
      if (!id)
        return Response.json({ message: 'Unauthorized' }, { status: 401 });
      return handler(
        request,
        { user: { id }, supabase: f.client() },
        await context.params
      );
    },
}));

import { DELETE, PATCH } from './route';

const origin = 'https://storage.test';
const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspaceW = '11111111-1111-4111-8111-111111111111';
const workspaceX = '22222222-2222-4222-8222-222222222222';
const ticket = 'abcdef01-2345-4678-9abc-def012345678';
const filename = `avatar-${ticket}.webp`;
const ownPath = `workspaces/${workspaceW}/${filename}`;
const personalB = `${actorB}/${ticket}.webp`;
const foreignWorkspace = `workspaces/${workspaceX}/${filename}`;
const publicUrl = (path: string) =>
  `${origin}/storage/v1/object/public/avatars/${path}`;
const invalidPaths = [
  ...[personalB, foreignWorkspace].flatMap((victim) => [
    `workspaces/${workspaceW}/../../${victim}`,
    `workspaces/${workspaceW}/%2e%2e/%2e%2e/${victim}`,
    `workspaces/${workspaceW}/%2E%2E/%2E%2E/${victim}`,
    `workspaces/${workspaceW}/%252e%252e/%252e%252e/${victim}`,
    `workspaces/${workspaceW}/..%2f..%2f${victim}`,
    `workspaces/${workspaceW}\\..\\..\\${victim.replaceAll('/', '\\')}`,
    `workspaces/${workspaceW}//../../${victim}`,
  ]),
  personalB,
  foreignWorkspace,
  ownPath.replace('/avatar-', '/%61vatar-'),
  ownPath.replace('/avatar-', '//avatar-'),
  ownPath.replace('/avatar-', '/extra/avatar-'),
  ownPath.replace(ticket, ticket.toUpperCase()),
  `${ownPath}?download=1`,
  `${ownPath}#fragment`,
  `${ownPath}\n`,
  ` ${ownPath} `,
  ownPath.replace('.webp', '.png'),
  `workspaces/${workspaceW}/avatar.webp`,
];
const invalidUrls = [
  ...[personalB, foreignWorkspace].flatMap((victim) => [
    `${publicUrl(victim)}?download=1`,
    `${publicUrl(victim)}#fragment`,
    publicUrl(victim).replace('storage.test', 'STORAGE.TEST'),
    publicUrl(victim).replace('storage.test', 'storage.test:443'),
    publicUrl(victim).replace('/avatars/', '/banners/'),
    publicUrl(victim).replace('/avatars/', '/avatars//'),
  ]),
  ...invalidPaths.map(publicUrl),
  publicUrl(ownPath).replace('storage.test', 'STORAGE.TEST'),
  publicUrl(ownPath).replace('storage.test', 'storage.test:443'),
  publicUrl(ownPath).replace('/avatars/', '/banners/'),
  publicUrl(ownPath).replace('/avatars/', '/avatars//'),
  publicUrl(ownPath).replace(origin, 'https://foreign.test'),
  publicUrl(ownPath).replace(origin, 'https://storage.test@foreign.test'),
  'not a URL',
];

const context = { params: Promise.resolve({ wsId: 'workspace-alias' }) };
const request = (method: string, filePath?: unknown, actor = actorA) =>
  new NextRequest('https://app.test/api/v1/workspaces/workspace-alias/avatar', {
    method,
    headers: { 'x-test-user': actor, 'Content-Type': 'application/json' },
    ...(method === 'PATCH' ? { body: JSON.stringify({ filePath }) } : {}),
  });
let storedUrl: string | null;
let objects: Set<string>;
const updateEq = vi.fn();
const update =
  vi.fn<(values: { avatar_url: string | null }) => { eq: typeof updateEq }>();
const remove = vi.fn();
const storageFrom = vi.fn();
const sessionRemove = vi.fn();
const adminStorageFrom = vi.fn();
const tableFrom = vi.fn();
const single = vi.fn();
const client = { from: tableFrom, storage: { from: storageFrom } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
  vi.stubEnv('SUPABASE_SERVER_URL', '');
  storedUrl = publicUrl(ownPath);
  objects = new Set([ownPath, personalB, foreignWorkspace]);
  single.mockImplementation(async () => ({
    data: { avatar_url: storedUrl },
    error: null,
  }));
  update.mockImplementation((values: { avatar_url: string | null }) => {
    updateEq.mockImplementation(() => {
      storedUrl = values.avatar_url;
      const result = Promise.resolve({ data: { id: workspaceW }, error: null });
      return Object.assign(result, {
        select: () => ({ single: () => result }),
      });
    });
    return { eq: updateEq };
  });
  tableFrom.mockImplementation(() => ({
    select: () => ({ eq: () => ({ single }) }),
    update,
  }));
  remove.mockImplementation(async (paths: string[]) => {
    for (const path of paths) objects.delete(path);
    return { error: null };
  });
  storageFrom.mockImplementation(() => ({
    getPublicUrl: (path: string) => ({ data: { publicUrl: publicUrl(path) } }),
    remove: sessionRemove,
  }));
  adminStorageFrom.mockReturnValue({ remove });
  f.createAdminClient.mockImplementation(async () => {
    expect(storedUrl).toBeNull();
    return { storage: { from: adminStorageFrom } };
  });

  f.client.mockReturnValue(client);
  f.getPermissions.mockImplementation(
    async ({ user }: { user: { id: string } }) =>
      user.id === actorA
        ? { wsId: workspaceW, withoutPermission: () => false }
        : null
  );
});
afterEach(() => vi.unstubAllEnvs());

describe('workspace avatar ownership', () => {
  it.each(invalidPaths)('rejects a non-ticket PATCH path: %s', async (path) => {
    const response = await PATCH(request('PATCH', path), context);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(objects.has(personalB)).toBe(true);
    expect(objects.has(foreignWorkspace)).toBe(true);
  });

  it.each(invalidUrls)(
    'clears an untrusted stored URL without deleting objects: %s',
    async (url) => {
      // Model a previously stored URL, including direct row updates that bypass PATCH.
      storedUrl = url;
      const response = await DELETE(request('DELETE'), context);
      expect(response.status).toBe(200);
      expect(storedUrl).toBeNull();
      expect(updateEq).toHaveBeenCalledWith('id', workspaceW);
      expect(remove).not.toHaveBeenCalled();
      expect(f.createAdminClient).not.toHaveBeenCalled();
      expect(objects).toEqual(new Set([ownPath, personalB, foreignWorkspace]));
    }
  );

  it('sets and removes only the authorized workspace ticket', async () => {
    storedUrl = null;
    const set = await PATCH(request('PATCH', ownPath), context);
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      success: true,
      avatarUrl: publicUrl(ownPath),
    });
    expect(storedUrl).toBe(publicUrl(ownPath));
    expect(updateEq).toHaveBeenCalledWith('id', workspaceW);
    const response = await DELETE(request('DELETE'), context);
    expect(response.status).toBe(200);
    expect(storedUrl).toBeNull();
    expect(storageFrom).toHaveBeenCalledWith('avatars');
    expect(remove).toHaveBeenCalledExactlyOnceWith([ownPath]);
    expect(objects).toEqual(new Set([personalB, foreignWorkspace]));
    expect(f.createAdminClient).toHaveBeenCalledExactlyOnceWith({
      noCookie: true,
    });
    expect(adminStorageFrom).toHaveBeenCalledWith('avatars');
    expect(sessionRemove).not.toHaveBeenCalled();
    expect(updateEq.mock.invocationCallOrder[1]).toBeLessThan(
      f.createAdminClient.mock.invocationCallOrder[0] ?? 0
    );
  });

  it.each(['PATCH', 'DELETE'])(
    'requires settings permission for %s',
    async (method) => {
      f.getPermissions.mockResolvedValue({
        wsId: workspaceW,
        withoutPermission: () => true,
        containsPermission: () => false,
      });
      const response = await (method === 'PATCH' ? PATCH : DELETE)(
        request(method, ownPath),
        context
      );
      expect(response.status).toBe(403);
      expect(tableFrom).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(f.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it.each(['PATCH', 'DELETE'])(
    'denies a workspace owned only by the other actor for %s',
    async (method) => {
      const response = await (method === 'PATCH' ? PATCH : DELETE)(
        request(method, ownPath, actorB),
        context
      );
      expect(response.status).toBe(403);
      expect(tableFrom).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(f.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('clears a missing avatar without a storage removal', async () => {
    storedUrl = null;
    expect((await DELETE(request('DELETE'), context)).status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not remove storage when clearing the field fails', async () => {
    update.mockReturnValue({ eq: updateEq });
    const result = Promise.resolve({
      data: null,
      error: new Error('fixture write failed'),
    });
    updateEq.mockReturnValue({ select: () => ({ single: () => result }) });
    expect((await DELETE(request('DELETE'), context)).status).toBe(500);
    expect(remove).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'not a URL',
    'https://storage.test/path',
    'https://user@storage.test',
  ])(
    'clears without removal for invalid trusted storage configuration: %s',
    async (configured) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configured);
      expect((await DELETE(request('DELETE'), context)).status).toBe(200);
      expect(storedUrl).toBeNull();
      expect(remove).not.toHaveBeenCalled();
      expect(f.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, 42])(
    'rejects an invalid PATCH payload: %s',
    async (filePath) => {
      expect((await PATCH(request('PATCH', filePath), context)).status).toBe(
        400
      );
      expect(update).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(f.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('keeps field removal successful when Storage returns a policy error', async () => {
    remove.mockResolvedValue({ error: new Error('Storage policy denied') });
    expect((await DELETE(request('DELETE'), context)).status).toBe(200);
    expect(storedUrl).toBeNull();
    expect(remove).toHaveBeenCalledExactlyOnceWith([ownPath]);
    expect(objects).toEqual(new Set([ownPath, personalB, foreignWorkspace]));
  });
  it.each(['https://server-storage.test', origin])(
    'removes an owned URL from either exact configured origin: %s',
    async (storedOrigin) => {
      vi.stubEnv('SUPABASE_SERVER_URL', 'https://server-storage.test');
      storedUrl = publicUrl(ownPath).replace(origin, storedOrigin);
      expect((await DELETE(request('DELETE'), context)).status).toBe(200);
      expect(remove).toHaveBeenCalledExactlyOnceWith([ownPath]);
      expect(storedUrl).toBeNull();
    }
  );

  it.each([
    'https://SERVER-STORAGE.TEST',
    'https://server-storage.test:443',
    'https://server-storage.test@foreign.test',
  ])(
    'rejects a noncanonical spelling of the server origin: %s',
    async (storedOrigin) => {
      vi.stubEnv('SUPABASE_SERVER_URL', 'https://server-storage.test');
      storedUrl = publicUrl(ownPath).replace(origin, storedOrigin);
      expect((await DELETE(request('DELETE'), context)).status).toBe(200);
      expect(remove).not.toHaveBeenCalled();
    }
  );

  it('never deletes another workspace object through the configured server origin', async () => {
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://server-storage.test');
    storedUrl = publicUrl(foreignWorkspace).replace(
      origin,
      'https://server-storage.test'
    );
    expect((await DELETE(request('DELETE'), context)).status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
    expect(objects.has(foreignWorkspace)).toBe(true);
  });
  it('does not create a privileged client when an RLS clear affects zero rows', async () => {
    update.mockReturnValue({ eq: updateEq });
    updateEq.mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: null }) }),
    });
    expect((await DELETE(request('DELETE'), context)).status).toBe(500);
    expect(storedUrl).toBe(publicUrl(ownPath));
    expect(f.createAdminClient).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(objects).toEqual(new Set([ownPath, personalB, foreignWorkspace]));
  });
});
