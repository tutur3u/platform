import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
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
const CREATOR = '5707a6e0-0000-4000-8000-000000009705';
const MEMBER = '5707a6e0-0000-4000-8000-000000009702';
const NON_MEMBER = '5707a6e0-0000-4000-8000-000000009706';
const IMAGE = `${WS}/mira/images/0b046a4f-8fc5-41bf-8b2b-1ec94abd0362.png`;

let createSignedUrls: ReturnType<typeof vi.fn>;
let transactionFilters: Array<[string, string]>;
let transactionError: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  transactionFilters = [];
  transactionError = null;
  mocks.verifyWorkspaceMembershipType.mockImplementation(
    async ({ userId, wsId }: { userId: string; wsId: string }) =>
      wsId === WS && (userId === CREATOR || userId === MEMBER)
        ? { membershipType: 'MEMBER', ok: true }
        : { error: 'membership_missing', ok: false }
  );
  createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ signedUrl: `https://signed/${path}` })),
    error: null,
  }));
  // ai_credit_transactions: CREATOR generated IMAGE.
  const query = {
    eq: vi.fn((column: string, value: string) => {
      transactionFilters.push([column, value]);
      return query;
    }),
    limit: vi.fn(async () => {
      if (transactionError) return { data: null, error: transactionError };
      const filters = Object.fromEntries(transactionFilters);
      const match =
        filters.user_id === CREATOR &&
        filters.feature === 'image_generation' &&
        filters['metadata->>storagePath'] === IMAGE;
      return { data: match ? [{ id: 'tx-1' }] : [], error: null };
    }),
    select: vi.fn(() => query),
  };
  mocks.createDynamicAdminClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table !== 'ai_credit_transactions') {
        throw new Error(`unexpected table ${table}`);
      }
      return query;
    }),
    rpc: vi.fn(async () => ({ data: false, error: null })),
    storage: { from: vi.fn(() => ({ createSignedUrls })) },
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

describe('POST /api/ai/chat/signed-read-url for Mira images', () => {
  it('signs a generated image for the member who generated it', async () => {
    const response = await signedReadUrl(CREATOR, [IMAGE]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      urls: [{ path: IMAGE, signedUrl: `https://signed/${IMAGE}` }],
    });
    expect(createSignedUrls).toHaveBeenCalledWith([IMAGE], 3600);
  });

  it.each([
    ['another workspace member', MEMBER],
    ['a non-member', NON_MEMBER],
  ])('forbids %s', async (_, userId) => {
    const response = await signedReadUrl(userId, [IMAGE]);

    expect(response.status).toBe(403);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it.each([
    ['nested', `${WS}/mira/images/nested/a.png`],
    ['encoded dot-dot', `${WS}/mira/images/%2e%2e`],
    ['QR root', `${WS}/drive/mira/qr/a.png`],
    ['other private root', `${WS}/recordings/a.webm`],
  ])('rejects %s paths', async (_, path) => {
    const response = await signedReadUrl(CREATOR, [path]);

    expect(response.status).toBe(400);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('fails closed when the generator cannot be verified', async () => {
    transactionError = new Error('db down');
    const response = await signedReadUrl(CREATOR, [IMAGE]);

    expect(response.status).toBe(500);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
