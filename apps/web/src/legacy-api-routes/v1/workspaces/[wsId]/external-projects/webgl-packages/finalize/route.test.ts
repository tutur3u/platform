// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { webglExtractionAllows } from '@/lib/external-projects/webgl-extraction';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: mocks.access,
}));
vi.mock('@/lib/external-projects/store', () => ({
  createWorkspaceExternalProjectAsset: mocks.create,
  updateWorkspaceExternalProjectAsset: mocks.update,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: async () =>
    'https://storage.example.test/fixture.zip',
  listWorkspaceStorageRawObjectsForProvider: mocks.list,
  resolveWorkspaceStorageProvider: async () => ({ provider: 'r2' }),
  WorkspaceStorageError: Error,
}));
vi.mock('../shared', () => ({
  buildWebglPackageUploadPath: () =>
    'external-projects/custom/games/fixture/webgl-packages',
  getWebglPackageEntryContext: async () => ({}),
  isCmsGamesEnabled: async () => true,
  resolveWebglCallbackOrigin: () => 'https://app.example.test',
  resolveWebglPackageExtractConfig: async () => ({
    configured: true,
    proxyToken: 'synthetic-extractor-key',
    proxyUrl: 'https://extractor.example.test/extract',
  }),
}));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const archive =
  'external-projects/custom/games/fixture/webgl-packages/fixture.zip';

function finalize() {
  return POST(
    new Request('https://app.example.test/finalize', {
      method: 'POST',
      body: JSON.stringify({ archivePath: archive, entryId }),
    }),
    { params: Promise.resolve({ wsId: workspaceId }) }
  );
}

afterEach(() => vi.unstubAllGlobals());

it('isolates re-finalizations of one archive and leaves the current package intact if extraction is partial', async () => {
  const originalRoot =
    'external-projects/custom/games/fixture/webgl-packages/fixture';
  const objects = new Map([[originalRoot + '/index.html', 'original package']]);
  let current = { id: 'asset-1', storage_path: originalRoot };
  const roots: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: current }),
  };
  mocks.access.mockResolvedValue({
    ok: true,
    admin: { from: () => query },
    binding: {},
    normalizedWorkspaceId: workspaceId,
    user: { id: 'fixture-actor' },
  });
  mocks.update.mockImplementation(async (id, values) => {
    current = { id, storage_path: values.storage_path };
    return current;
  });
  mocks.list.mockImplementation(async (_ws, _provider, { pathPrefix }) =>
    Array.from(objects, ([path, value]) => ({
      path,
      size: value.length,
    })).filter(({ path }) => path.startsWith(`${pathPrefix}/`))
  );
  const extract = vi.fn(async (_url: string, init: RequestInit) => {
    const {
      callbackUrl,
      callbackToken,
      destinationPrefix,
      includeFileDigests,
    } = JSON.parse(String(init.body));
    roots.push(destinationPrefix);
    const path = `${destinationPrefix}/index.html`;
    expect(includeFileDigests).toBe(true);
    expect(new URL(callbackUrl).searchParams.get('root')).toBe(
      destinationPrefix
    );
    expect(
      webglExtractionAllows(
        'synthetic-extractor-key',
        callbackToken,
        workspaceId,
        destinationPrefix,
        path
      )
    ).toBe(true);
    const bytes = `package ${roots.length}`;
    objects.set(path, bytes);
    const inventory = [
      {
        path,
        contentType: 'text/html',
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ];
    if (roots.length === 1)
      return Response.json({ files: 2, inventory }, { status: 502 });
    if (roots.length === 2)
      inventory.push({
        ...inventory[0]!,
        path: `${destinationPrefix}/missing.js`,
      });
    return Response.json({ files: inventory.length, inventory });
  });
  vi.stubGlobal('fetch', extract);
  expect((await finalize()).status).toBe(502);
  expect((await finalize()).status).toBe(502);
  expect(current.storage_path).toBe(originalRoot);
  expect(mocks.update).not.toHaveBeenCalled();

  const third = await finalize();
  const fourth = await finalize();
  expect(third.status).toBe(200);
  expect(fourth.status).toBe(200);
  expect(new Set(roots).size).toBe(4);
  expect(await fourth.json()).toMatchObject({
    artifact: {
      version: 2,
      rootPath: roots[3],
      files: [{ relativePath: 'index.html', sha256: expect.any(String) }],
    },
  });
  expect(objects.get(`${originalRoot}/index.html`)).toBe('original package');
  expect(objects.get(`${roots[2]}/index.html`)).toBe('package 3');
  expect(objects.get(`${roots[3]}/index.html`)).toBe('package 4');
  expect(mocks.create).not.toHaveBeenCalled();
});
