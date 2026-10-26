import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: () => mocks.createDynamicAdminClient(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

type RoutePost = (
  request: Request,
  context: { supabase: unknown; user: { id: string } }
) => Promise<Response>;

const WS = '5707a6e0-0000-4000-8000-000000009711';
const OWNER = '5707a6e0-0000-4000-8000-000000009705';
const MEMBER = '5707a6e0-0000-4000-8000-000000009702';
const NON_MEMBER = '5707a6e0-0000-4000-8000-000000009706';
const CHAT = '5707a6e0-0000-4000-8000-000000009721';
const MISSING_CHAT = '5707a6e0-0000-4000-8000-0000000097ff';

let storage: {
  createSignedUrls: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};
let rpc: ReturnType<typeof vi.fn>;
let chatLookupError: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  chatLookupError = null;
  mocks.normalizeWorkspaceId.mockResolvedValue(WS);
  // MEMBER of WS: owner and member; nobody else.
  mocks.verifyWorkspaceMembershipType.mockImplementation(
    async ({ userId, wsId }: { userId: string; wsId: string }) =>
      wsId === WS && (userId === OWNER || userId === MEMBER)
        ? { membershipType: 'MEMBER', ok: true }
        : { error: 'membership_missing', ok: false }
  );
  storage = {
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ signedUrl: `https://signed/${path}` })),
      error: null,
    })),
    list: vi.fn(async () => ({
      data: [
        {
          created_at: '2026-10-26T00:00:00.000Z',
          id: 'file-1',
          metadata: { size: 1 },
          name: '1_a.png',
        },
      ],
      error: null,
    })),
  };
  // Nobody has Drive permissions: these routes must not need them.
  rpc = vi.fn(async () => ({ data: false, error: null }));
  mocks.createDynamicAdminClient.mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, chatId: string) => ({
          maybeSingle: async () =>
            chatLookupError
              ? { data: null, error: chatLookupError }
              : {
                  data: chatId === CHAT ? { creator_id: OWNER } : null,
                  error: null,
                },
        })),
      })),
    })),
    rpc,
    storage: { from: vi.fn(() => storage) },
  });
});

async function signedReadUrl(userId: string, paths: string[]) {
  const { POST } = (await import('./signed-read-url/route')) as unknown as {
    POST: RoutePost;
  };
  return POST(
    new Request('https://web.tuturuuu.com/api/ai/chat/signed-read-url', {
      body: JSON.stringify({ paths }),
      method: 'POST',
    }),
    { supabase: {}, user: { id: userId } }
  );
}

async function fileUrls(userId: string, chatId: string) {
  const { POST } = (await import('./file-urls/route')) as unknown as {
    POST: RoutePost;
  };
  return POST(
    new Request('https://web.tuturuuu.com/api/ai/chat/file-urls', {
      body: JSON.stringify({ chatId, wsId: 'personal' }),
      method: 'POST',
    }),
    { supabase: {}, user: { id: userId } }
  );
}

const ownChatFile = `${WS}/chats/ai/resources/${CHAT}/1_a.png`;
const ownTempFile = `${WS}/chats/ai/resources/temp/${OWNER}/1_b.png`;

describe('POST /api/ai/chat/signed-read-url', () => {
  it('signs the owner chat and temp attachments without Drive permissions', async () => {
    const response = await signedReadUrl(OWNER, [ownChatFile, ownTempFile]);

    expect(response.status).toBe(200);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(
      [ownChatFile, ownTempFile],
      3600
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects Drive paths, even for a member without view_drive', async () => {
    const response = await signedReadUrl(MEMBER, [`${WS}/docs/report.pdf`]);

    expect(response.status).toBe(400);
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-member', NON_MEMBER, [ownChatFile]],
    ['another member on the owner chat', MEMBER, [ownChatFile]],
    ['another member on the owner temp folder', MEMBER, [ownTempFile]],
    [
      'a missing chat',
      OWNER,
      [`${WS}/chats/ai/resources/${MISSING_CHAT}/x.png`],
    ],
    [
      'a batch with one foreign path',
      MEMBER,
      [`${WS}/chats/ai/resources/temp/${MEMBER}/mine.png`, ownChatFile],
    ],
  ])('forbids %s', async (_, userId, paths) => {
    const response = await signedReadUrl(userId, paths);

    expect(response.status).toBe(403);
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it.each([
    ['dot-dot', `${WS}/chats/ai/resources/${CHAT}/../${MISSING_CHAT}/x`],
    ['dot', `${WS}/chats/ai/resources/./${CHAT}/x`],
    ['encoded dot-dot', `${WS}/chats/ai/resources/${CHAT}/%2e%2e/x`],
    ['encoded root', `${WS}/%63hats/ai/resources/${CHAT}/1_a.png`],
    ['encoded separator', `${WS}/chats%2Fai%2Fresources/${CHAT}/1_a.png`],
    ['private non-AI chats root', `${WS}/chats/conversations/x.png`],
    ['legacy chat root', `${WS}/chat/${CHAT}/a.png`],
  ])('rejects %s paths', async (_, path) => {
    const response = await signedReadUrl(OWNER, [path]);

    expect(response.status).toBe(400);
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it('fails closed when chat ownership cannot be verified', async () => {
    chatLookupError = new Error('db down');
    const response = await signedReadUrl(OWNER, [ownChatFile]);

    expect(response.status).toBe(500);
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/chat/file-urls', () => {
  it('lists and signs the owner chat folder', async () => {
    const response = await fileUrls(OWNER, CHAT);

    expect(response.status).toBe(200);
    expect(storage.list).toHaveBeenCalledWith(
      `${WS}/chats/ai/resources/${CHAT}`,
      expect.any(Object)
    );
    await expect(response.json()).resolves.toMatchObject({
      files: [
        { name: 'a.png', path: `${WS}/chats/ai/resources/${CHAT}/1_a.png` },
      ],
    });
  });

  it.each([
    ['a non-member', NON_MEMBER, CHAT],
    ['another member (no Drive rights help)', MEMBER, CHAT],
    ['a missing chat', OWNER, MISSING_CHAT],
  ])('forbids %s without listing', async (_, userId, chatId) => {
    const response = await fileUrls(userId, chatId);

    expect(response.status).toBe(403);
    expect(storage.list).not.toHaveBeenCalled();
  });

  it('rejects a workspace that does not normalize to an id', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValueOnce('not-a-workspace-id');
    const response = await fileUrls(OWNER, CHAT);

    expect(response.status).toBe(400);
    expect(storage.list).not.toHaveBeenCalled();
  });

  it('fails closed when chat ownership cannot be verified', async () => {
    chatLookupError = new Error('db down');
    const response = await fileUrls(OWNER, CHAT);

    expect(response.status).toBe(500);
    expect(storage.list).not.toHaveBeenCalled();
  });
});
