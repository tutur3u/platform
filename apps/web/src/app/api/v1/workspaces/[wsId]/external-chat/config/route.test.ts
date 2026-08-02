import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  assertSafeExternalChatUrl: vi.fn(),
  ExternalChatUrlPolicyError: class ExternalChatUrlPolicyError extends Error {},
  readExternalChatBinding: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serializeExternalChatBinding: vi.fn(),
  writeExternalChatSettings: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, { user: { id: 'user-1' } }, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/external-chat/safe-control-request', () => ({
  assertSafeExternalChatUrl: (...args: unknown[]) =>
    mocks.assertSafeExternalChatUrl(...args),
  ExternalChatUrlPolicyError: mocks.ExternalChatUrlPolicyError,
}));

vi.mock('@/lib/external-chat/store', () => ({
  readExternalChatBinding: (...args: unknown[]) =>
    mocks.readExternalChatBinding(...args),
  serializeExternalChatBinding: (...args: unknown[]) =>
    mocks.serializeExternalChatBinding(...args),
  writeExternalChatSettings: (...args: unknown[]) =>
    mocks.writeExternalChatSettings(...args),
}));

const params = { params: Promise.resolve({ wsId: 'workspace-1' }) };
const validSettings = {
  agentMappings: {},
  authorityMode: 'legacy_primary',
  bridgeBaseUrl: 'https://bridge.example.com',
  enabled: true,
  inboxDefaults: {},
};

function patchRequest(payload: unknown) {
  return new Request('http://localhost/external-chat/config', {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  });
}

describe('external chat config route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSafeExternalChatUrl.mockResolvedValue(undefined);
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.readExternalChatBinding.mockResolvedValue({ binding: {} });
    mocks.serializeExternalChatBinding.mockReturnValue({
      readiness: { errors: [], ready: true },
    });
  });

  it('returns only the serialized binding state', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/config') as never,
      params
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      readiness: { errors: [], ready: true },
    });
  });

  it('rejects invalid settings and bridge URLs with paths', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      patchRequest({
        ...validSettings,
        bridgeBaseUrl: 'https://bridge.example.com/private',
      }) as never,
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.assertSafeExternalChatUrl).not.toHaveBeenCalled();
    expect(mocks.writeExternalChatSettings).not.toHaveBeenCalled();
  });

  it('rejects a destination blocked by the network safety policy', async () => {
    mocks.assertSafeExternalChatUrl.mockRejectedValue(
      new mocks.ExternalChatUrlPolicyError('blocked')
    );
    const { PATCH } = await import('./route');
    const response = await PATCH(patchRequest(validSettings) as never, params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Bridge URL is not allowed',
    });
  });

  it('returns 503 when destination validation is temporarily unavailable', async () => {
    mocks.assertSafeExternalChatUrl.mockRejectedValue(
      new Error('resolver unavailable')
    );
    const { PATCH } = await import('./route');
    const response = await PATCH(patchRequest(validSettings) as never, params);

    expect(response.status).toBe(503);
    expect(mocks.writeExternalChatSettings).not.toHaveBeenCalled();
  });

  it('allows disabling without depending on bridge DNS availability', async () => {
    const { PATCH } = await import('./route');
    const disabledSettings = { ...validSettings, enabled: false };
    const response = await PATCH(
      patchRequest(disabledSettings) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.assertSafeExternalChatUrl).not.toHaveBeenCalled();
    expect(mocks.writeExternalChatSettings).toHaveBeenCalledWith(
      'workspace-1',
      disabledSettings,
      'user-1'
    );
  });

  it('returns 404 without writing when the binding is absent', async () => {
    mocks.readExternalChatBinding.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patchRequest(validSettings) as never, params);

    expect(response.status).toBe(404);
    expect(mocks.writeExternalChatSettings).not.toHaveBeenCalled();
  });

  it('persists valid settings and returns refreshed masked state', async () => {
    const refreshed = { binding: { is_enabled: true } };
    mocks.readExternalChatBinding
      .mockResolvedValueOnce({ binding: {} })
      .mockResolvedValueOnce(refreshed);
    const { PATCH } = await import('./route');
    const response = await PATCH(patchRequest(validSettings) as never, params);

    expect(response.status).toBe(200);
    expect(mocks.writeExternalChatSettings).toHaveBeenCalledWith(
      'workspace-1',
      validSettings,
      'user-1'
    );
    expect(mocks.serializeExternalChatBinding).toHaveBeenLastCalledWith(
      refreshed
    );
  });

  it('returns a masked conflict while an outbound delivery is active', async () => {
    mocks.writeExternalChatSettings.mockRejectedValue(
      new Error('external_chat_delivery_in_progress')
    );
    const { PATCH } = await import('./route');
    const response = await PATCH(patchRequest(validSettings) as never, params);

    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(
      'external_chat_delivery_in_progress'
    );
  });

  it('masks unexpected settings persistence failures', async () => {
    mocks.writeExternalChatSettings.mockRejectedValue(
      new Error('secret-value')
    );
    const { PATCH } = await import('./route');
    const response = await PATCH(patchRequest(validSettings) as never, params);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret-value');
  });
});
