import { vi } from 'vitest';

/** Shared in-memory admin client for the AI chat resource routes. */
export type ResourceAdminState = {
  chats: { id: string; creator_id: string | null }[];
  threads: { id: string; creator_id: string | null; ws_id: string }[];
  lookupError: { message: string } | null;
  /** Stored objects by full path. */
  objects: Map<string, Uint8Array>;
};

/** Workspace ids are UUIDs, as the bucket-RLS path classifier requires. */
export const WS = '66666666-6666-4666-8666-666666666666';
export const OTHER_WS = '77777777-7777-4777-8777-777777777777';
export const OWN_CHAT = '11111111-1111-4111-8111-111111111111';
export const OTHER_CHAT = '22222222-2222-4222-8222-222222222222';
/** Mind threads own no chat-resource folder (storage RLS: ai_chats only). */
export const OWN_THREAD = '33333333-3333-4333-8333-333333333333';
export const OTHER_THREAD = '44444444-4444-4444-8444-444444444444';
export const UNKNOWN_ID = '55555555-5555-4555-8555-555555555555';

export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

export function seedResourceAdminState(state: ResourceAdminState) {
  state.chats = [
    { id: OWN_CHAT, creator_id: 'actor' },
    { id: OTHER_CHAT, creator_id: 'other-member' },
  ];
  state.threads = [
    { id: OWN_THREAD, creator_id: 'actor', ws_id: WS },
    { id: OTHER_THREAD, creator_id: 'other-member', ws_id: WS },
  ];
  state.lookupError = null;
  state.objects = new Map();
}

function table(
  rows: () => Record<string, unknown>[],
  state: ResourceAdminState
) {
  const filters: [string, unknown][] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    maybeSingle: async () => ({
      data:
        rows().find((row) =>
          filters.every(([key, value]) => row[key] === value)
        ) ?? null,
      error: state.lookupError,
    }),
  };
  return query;
}

export function createResourceAdmin(state: ResourceAdminState) {
  const bucket = {
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: {
        path,
        signedUrl: `https://storage.test/upload/${path}`,
        token: 't',
      },
      error: null,
    })),
    createSignedUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://storage.test/read/${path}` },
      error: null,
    })),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://storage.test/read/${path}`,
      })),
      error: null,
    })),
    info: vi.fn(async (path: string) => {
      const bytes = state.objects.get(path);
      return bytes
        ? { data: { size: bytes.byteLength }, error: null }
        : { data: null, error: { message: 'Object not found' } };
    }),
    list: vi.fn(async (prefix: string) => ({
      data: [...state.objects]
        .filter(([path]) => path.startsWith(`${prefix}/`))
        .map(([path, bytes]) => ({
          created_at: null,
          id: path,
          metadata: { size: bytes.byteLength },
          name: path.slice(prefix.length + 1),
        })),
      error: null,
    })),
    remove: vi.fn(async (paths: string[]) => {
      for (const path of paths) state.objects.delete(path);
      return { data: [], error: null };
    }),
  };

  return {
    bucket,
    client: {
      from: (name: string) =>
        table(() => (name === 'ai_chats' ? state.chats : []), state),
      // Nobody has Drive permissions: chat resource routes must not need them.
      rpc: vi.fn(async () => ({ data: false, error: null })),
      schema: () => ({
        from: (name: string) =>
          table(() => (name === 'mind_ai_threads' ? state.threads : []), state),
      }),
      storage: { from: () => bucket },
    },
  };
}

/** Serves ranged reads of `state.objects` for the signed head URLs. */
export function stubStorageFetch(state: ResourceAdminState) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('https://storage.test/read/', '');
    const bytes = state.objects.get(path);
    if (!bytes) return new Response(null, { status: 404 });
    const range = new Headers(init?.headers).get('Range');
    const end = range ? Number(range.split('-')[1]) + 1 : bytes.byteLength;
    return new Response(bytes.slice(0, end), { status: 206 });
  });
}
