// @vitest-environment node
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createDynamicClient: mocks.client,
}));
vi.mock('@tuturuuu/internal-api', () => ({ getCurrentUserProfile: vi.fn() }));
vi.mock('@/components/chat-permissions', () => ({}));
vi.mock('./assistant-header', () => ({}));
vi.mock('./assistant-toolbar', () => ({}));
vi.mock('./prompt-form', () => ({}));

import { uploadFile } from './chat-panel';

const supabaseRequire = createRequire(
  resolve(import.meta.dirname, '../../../../packages/supabase/package.json')
);
const sdkRequire = createRequire(
  supabaseRequire.resolve('@supabase/supabase-js')
);
const { StorageClient } = sdkRequire('@supabase/storage-js');
let keys: string[];
let urls: URL[];
beforeEach(() => {
  keys = [];
  urls = [];
  const storage = new StorageClient(
    'https://synthetic.invalid/storage/v1',
    {},
    async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url);
      const key = decodeURIComponent(
        url.pathname.slice('/storage/v1/object/workspaces/'.length)
      );
      keys.push(key);
      return Response.json({ Key: `workspaces/${key}` });
    }
  );
  mocks.client.mockReturnValue({ storage });
});

it.each([
  ['%41.txt', '%41.txt'],
  ['hash#.txt', 'hash#.txt'],
  ['what?.txt', 'what.txt'],
  ['Báo cáo.txt', 'Báo cáo.txt'],
  ['Báo cáo.txt'.normalize('NFD'), 'Báo cáo.txt'.normalize('NFD')],
])(
  'preserves the logical sanitized Rewise filename %s',
  async (name, stored) => {
    const rawFile = new File(['synthetic'], name, { type: 'text/plain' });
    const result = await uploadFile(
      { rawFile, url: '', status: 'pending' },
      'chat',
      'workspace'
    );
    const path = `workspace/chats/ai/resources/chat/${stored}`;
    expect(result.error).toBeNull();
    expect(keys).toEqual([path]);
    expect(result.data).toMatchObject({ path });
    expect(result.finalPath).toBe(path);
    expect(urls.map(({ search, hash }) => ({ search, hash }))).toEqual([
      { search: '', hash: '' },
    ]);
  }
);
