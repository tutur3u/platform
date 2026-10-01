import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  download: vi.fn(),
  provider: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: (...args: unknown[]) => mocks.admin(...args),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
  getPermissions: (...args: unknown[]) => mocks.permissions(...args),
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@tuturuuu/finance-core/storage-access', () => ({
  getFinanceTransactionIdFromStoragePath: () => null,
  canAccessFinanceTransactionStoragePath: async () => false,
}));
vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: async () => null,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageFolderByPath: vi.fn(),
  resolveWorkspaceStorageProvider: (...args: unknown[]) =>
    mocks.provider(...args),
  downloadWorkspaceStorageObjectForProvider: (...args: unknown[]) =>
    mocks.download(...args),
  uploadWorkspaceStorageFileDirect: (...args: unknown[]) =>
    mocks.upload(...args),
}));

import { copyAiChatAttachmentInputsToResources } from './ai-message-shared';

// Resolve the actual transitive SDK selected by the workspace lockfile.
const supabaseRequire = createRequire(
  resolve(
    import.meta.dirname,
    '../../../../../../../../../../../../packages/supabase/package.json'
  )
);
const sdkRequire = createRequire(
  supabaseRequire.resolve('@supabase/supabase-js')
);
const { StorageClient } = sdkRequire('@supabase/storage-js');
const auth = {
  user: { id: 'actor-a' },
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  },
} as never;
const encodeFirstLetter = (path: string) =>
  `%${path.charCodeAt(0).toString(16)}${path.slice(1)}`;
function copy(path: string) {
  return copyAiChatAttachmentInputsToResources({
    auth,
    attachments: [{ filename: 'fixture.txt', path }],
    chatId: 'owned-chat',
    wsId: 'workspace-1',
  });
}

describe('attachment source request identity', () => {
  let requestedKeys: string[];
  let urlParts: Array<{ search: string; hash: string }>;
  beforeEach(async () => {
    vi.clearAllMocks();
    requestedKeys = [];
    urlParts = [];
    mocks.permissions.mockResolvedValue({
      withoutPermission: (p: string) => p !== 'view_drive',
    });
    mocks.provider.mockResolvedValue({ provider: 'supabase' });
    mocks.upload.mockResolvedValue(undefined);
    const storage = new StorageClient(
      'https://synthetic.invalid/storage/v1',
      {},
      async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        // Synthetic provider routing decodes the request pathname exactly once.
        requestedKeys.push(
          decodeURIComponent(
            url.pathname.slice('/storage/v1/object/workspaces/'.length)
          )
        );
        urlParts.push({ search: url.search, hash: url.hash });
        return new Response(new Uint8Array([1]), {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    );
    mocks.admin.mockResolvedValue({ storage });
    const adapter = await vi.importActual<
      typeof import('@tuturuuu/storage-core/workspace-storage-provider')
    >('@tuturuuu/storage-core/workspace-storage-provider');
    mocks.download.mockImplementation(async (wsId, provider, path) => {
      if (provider === 'r2') {
        requestedKeys.push(`${wsId}/${path}`);
        return { buffer: new Uint8Array([1]), contentType: 'text/plain' };
      }
      return adapter.downloadWorkspaceStorageObjectForProvider(
        wsId,
        provider,
        path
      );
    });
  });
  it.each([
    'task-images/fixture.txt',
    'chats/ai/resources/foreign-chat/fixture.txt',
  ])(
    'denies domain-owned source %s before requesting storage',
    async (path) => {
      await expect(copy(path)).rejects.toThrow('Failed to prepare');
      expect(requestedKeys).toEqual([]);
      expect(mocks.download).not.toHaveBeenCalled();
    }
  );
  it.each([
    encodeFirstLetter('task-images/fixture.txt'),
    encodeFirstLetter('chats/ai/resources/foreign-chat/fixture.txt'),
    'uploads/100% hoàn tất.txt',
    'uploads/literal%41.txt',
    'uploads/100%25 complete.txt',
    'uploads/name?#fragment.txt',
  ])('requests the exact authorized literal object key %s', async (path) => {
    await copy(path);
    expect(requestedKeys).toEqual([`workspace-1/${path}`]);
    expect(urlParts).toEqual([{ search: '', hash: '' }]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
  it('keeps an authorized task-media source readable', async () => {
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
    await copy('task-images/fixture.txt');
    expect(requestedKeys).toEqual(['workspace-1/task-images/fixture.txt']);
  });
  it('preserves literal object keys for R2', async () => {
    mocks.provider.mockResolvedValue({ provider: 'r2' });
    const path = 'uploads/literal%41?# hoàn tất.txt';
    await copy(path);
    expect(requestedKeys).toEqual([`workspace-1/${path}`]);
  });
});
