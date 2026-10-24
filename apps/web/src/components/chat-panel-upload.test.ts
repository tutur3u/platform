// @vitest-environment node
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createDynamicClient: mocks.client,
}));
vi.mock('./chat-model-selector', () => ({}));
vi.mock('./prompt-form', () => ({}));
vi.mock('./scroll-to-bottom-button', () => ({}));
vi.mock('./scroll-to-top-button', () => ({}));
vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://synthetic.invalid',
}));

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
let queries: string[];
beforeEach(() => {
  keys = [];
  urls = [];
  queries = [];
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
  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      if (column === 'name') queries.push(value);
      return query;
    },
    not: () => query,
    ilike: () => query,
    order: async () => ({ data: [] }),
  };
  mocks.client.mockReturnValue({
    storage,
    schema: () => ({ from: () => query }),
  });
});

it.each([
  '%41.txt',
  'what?.txt',
  'hash#.txt',
  'Báo cáo.txt',
  'Báo cáo.txt'.normalize('NFD'),
])('uploads the exact logical chat filename %s', async (name) => {
  const file = new File(['synthetic'], name, { type: 'text/plain' });
  const result = await uploadFile(
    'workspace',
    { rawFile: file, url: '', status: 'pending' },
    'chat'
  );
  expect(result.error).toBeNull();
  expect(keys).toEqual([`workspace/chat/chat/${name}`]);
  expect(queries).toEqual([`workspace/chat/chat/${name}`]);
  expect(urls.map(({ search, hash }) => ({ search, hash }))).toEqual([
    { search: '', hash: '' },
  ]);
  expect(result.data?.path).toBe(`workspace/chat/chat/${name}`);
});
