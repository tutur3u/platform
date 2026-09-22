import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getWorkspaceTier: vi.fn(),
  isFeatureAvailable: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => mocks);
vi.mock('@tuturuuu/utils/ai-temp-auth', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);
vi.mock('@/lib/feature-tiers', () => mocks);
vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  resolveGatewayModelId: (id: string) => id,
}));

import { POST } from './route';

const chatId = 'd8da826b-4a0d-41fd-8bd7-d46514320f53';
const body = {
  wsId: 'workspace',
  chatId,
  turnId: 'turn',
  model: 'model',
  messages: [{ role: 'user', content: 'Hello' }],
};
function request(value: unknown = body) {
  return new Request('https://tuturuuu.com/api/v1/assistant/live/turns', {
    method: 'POST',
    body: JSON.stringify(value),
  });
}
function query(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

describe('mobile Live turn persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'caller' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    mocks.isFeatureAvailable.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValue(query({ data: { id: chatId }, error: null })),
    });
  });

  it.each([401, 403, 404, 500])(
    'never accesses protected messages when access fails (%i)',
    async (status) => {
      if (status === 401)
        mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
      if (status === 403)
        mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
      if (status >= 404)
        mocks.createClient.mockResolvedValue({
          from: vi.fn().mockReturnValue(
            query({
              data: null,
              error: status === 500 ? { message: 'lookup failed' } : null,
            })
          ),
        });
      expect((await POST(request())).status).toBe(status);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('rejects a revoked temporary session and insufficient entitlement', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'revoked' });
    expect((await POST(request())).status).toBe(401);
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.isFeatureAvailable.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('saves owned messages using the server client and protects turn metadata', async () => {
    const ownership = query({ data: { id: chatId }, error: null });
    const from = vi.fn().mockReturnValue(ownership);
    mocks.createClient.mockResolvedValue({ from });
    const messages = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(messages),
    });
    const response = await POST(
      request({
        ...body,
        messages: [
          {
            role: 'user',
            content: 'Hello',
            metadata: { liveTurnId: 'spoof', source: 'spoof' },
          },
        ],
      })
    );
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledExactlyOnceWith('ai_chats');
    expect(ownership.eq).toHaveBeenCalledWith('creator_id', 'caller');
    expect(messages.eq).toHaveBeenCalledWith('creator_id', 'caller');
    expect(messages.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        creator_id: 'caller',
        chat_id: chatId,
        metadata: { source: 'Mira', liveTurnId: 'turn' },
      }),
    ]);
  });

  it('deduplicates a retry without inserting again', async () => {
    const insert = vi.fn();
    mocks.createAdminClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              contains: async () => ({
                data: [{ id: 'message' }],
                error: null,
              }),
            }),
          }),
        }),
        insert,
      }),
    });
    expect(await (await POST(request())).json()).toEqual({
      success: true,
      inserted: 0,
      deduped: true,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects malformed and oversized batches before authentication', async () => {
    expect(
      (
        await POST(
          new Request('https://tuturuuu.com', { method: 'POST', body: '{' })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await POST(
          request({ ...body, messages: Array(21).fill(body.messages[0]) })
        )
      ).status
    ).toBe(400);
    expect(
      (await POST(request({ ...body, extra: 'x'.repeat(250001) }))).status
    ).toBe(413);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
