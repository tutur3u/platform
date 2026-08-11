import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  count?: number | null;
  data: unknown;
  error?: unknown;
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  imageResponse: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(...args: unknown[]) {
      super('rendered', { status: 200 });
      mocks.imageResponse(...args);
    }
  },
}));

function query(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    filter: vi.fn(() => builder),
    schema: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => result),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

function adminClient(avatarUrl: string | null) {
  const tableQueries = new Map([
    [
      'users',
      [
        query({
          data: {
            avatar_url: avatarUrl,
            display_name: 'Example User',
            id: '00000000-0000-4000-8000-000000000001',
          },
          error: null,
        }),
      ],
    ],
    [
      'nova_submissions_with_scores',
      [query({ data: [{ total_score: 10 }], error: null })],
    ],
    ['nova_sessions', [query({ count: 1, data: null, error: null })]],
  ]);
  const client = {
    from: vi.fn((table: string) => {
      const queued = tableQueries.get(table);
      if (!queued?.length) throw new Error(`Unexpected table: ${table}`);
      return queued.shift();
    }),
    schema: vi.fn(() => client),
  };
  return client;
}

function findAvatarSource(node: ReactNode): string | undefined {
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined;

  const element = node as {
    props: { alt?: string; children?: ReactNode; src?: string };
  };
  if (element.props.alt === 'User Avatar') return element.props.src;

  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];
  for (const child of children) {
    const source = findAvatarSource(child);
    if (source) return source;
  }
  return undefined;
}

async function renderOg(avatarUrl: string | null) {
  mocks.createAdminClient.mockResolvedValue(adminClient(avatarUrl));
  const { GET } = await import('./route');
  await GET(new Request('https://nova.test/api/og/user'), {
    params: Promise.resolve({
      userId: '00000000000040008000000000000001',
    }),
  });
  return mocks.imageResponse.mock.calls[0]?.[0] as ReactNode;
}

describe('Nova profile OG avatar source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Unexpected network request');
      })
    );
  });

  it('passes an approved public Supabase avatar to ImageResponse', async () => {
    const avatarUrl =
      'https://project-one.supabase.co/storage/v1/object/public/avatars/user/avatar.png';
    const tree = await renderOg(avatarUrl);

    expect(findAvatarSource(tree)).toBe(avatarUrl);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.test/avatar.png',
    'http://127.0.0.1/private.png',
    null,
  ])(
    'uses the fixed fallback for an unapproved or null avatar: %s',
    async (avatarUrl) => {
      const tree = await renderOg(avatarUrl);

      expect(findAvatarSource(tree)).toBe(
        'https://tuturuuu.com/media/logos/light.png'
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
