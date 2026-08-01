import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  clearExternalChatCredential: vi.fn(),
  markExternalChatCredentialVerified: vi.fn(),
  readExternalChatBinding: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serializeExternalChatBinding: vi.fn(),
  stageExternalChatCredential: vi.fn(),
  promoteExternalChatCredential: vi.fn(),
  upsertExternalChatCredentials: vi.fn(),
  updateExternalChatBridgeCredential: vi.fn(),
  verifyExternalChatControl: vi.fn(),
};

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

vi.mock('@/lib/external-chat/crypto', () => ({
  createIngestSecret: () => 'ecs_test_secret',
  decryptControlSecret: vi.fn(),
  encryptControlSecret: vi.fn(async () => 'encrypted-pending'),
  hashExternalChatSecret: vi.fn(() => 'h'.repeat(64)),
  secretLastFour: vi.fn(() => 'cret'),
}));

vi.mock('@/lib/external-chat/delivery', () => ({
  updateExternalChatBridgeCredential: (...args: unknown[]) =>
    mocks.updateExternalChatBridgeCredential(...args),
  verifyExternalChatControl: (...args: unknown[]) =>
    mocks.verifyExternalChatControl(...args),
}));

vi.mock('@/lib/external-chat/store', () => ({
  clearExternalChatCredential: (...args: unknown[]) =>
    mocks.clearExternalChatCredential(...args),
  markExternalChatCredentialVerified: (...args: unknown[]) =>
    mocks.markExternalChatCredentialVerified(...args),
  readExternalChatBinding: (...args: unknown[]) =>
    mocks.readExternalChatBinding(...args),
  serializeExternalChatBinding: (...args: unknown[]) =>
    mocks.serializeExternalChatBinding(...args),
  stageExternalChatCredential: (...args: unknown[]) =>
    mocks.stageExternalChatCredential(...args),
  promoteExternalChatCredential: (...args: unknown[]) =>
    mocks.promoteExternalChatCredential(...args),
  upsertExternalChatCredentials: (...args: unknown[]) =>
    mocks.upsertExternalChatCredentials(...args),
}));

function request(payload: Record<string, unknown> = { action: 'verify' }) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/external-chat/credentials',
    {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('external chat credential verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: { control_secret_encrypted: 'encrypted-control' },
    });
    mocks.markExternalChatCredentialVerified.mockResolvedValue(true);
    mocks.serializeExternalChatBinding.mockReturnValue({
      readiness: { errors: [], ready: true },
    });
  });

  it('records verification only after the signed bridge probe succeeds', async () => {
    mocks.verifyExternalChatControl.mockResolvedValue(undefined);
    const { POST } = await import('./route');
    const response = await POST(request() as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.verifyExternalChatControl).toHaveBeenCalledWith('workspace-1');
    expect(mocks.markExternalChatCredentialVerified).toHaveBeenCalledWith(
      'workspace-1',
      'encrypted-control'
    );
  });

  it('returns a masked readiness response and does not mark failed probes verified', async () => {
    mocks.verifyExternalChatControl.mockRejectedValue(
      new Error('secret-value')
    );
    mocks.serializeExternalChatBinding.mockReturnValue({
      readiness: { errors: ['bridge_unverified'], ready: false },
    });
    const { POST } = await import('./route');
    const response = await POST(request() as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret-value');
    expect(mocks.markExternalChatCredentialVerified).not.toHaveBeenCalled();
  });

  it('does not commit a paired ingest rotation when the bridge rejects it', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: { control_secret_encrypted: 'encrypted' },
    });
    mocks.updateExternalChatBridgeCredential.mockRejectedValue(
      new Error('bridge unavailable')
    );
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'rotate_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(502);
    expect(mocks.updateExternalChatBridgeCredential).toHaveBeenCalledWith({
      action: 'set_ingest',
      secret: 'ecs_test_secret',
      wsId: 'workspace-1',
    });
    expect(mocks.stageExternalChatCredential).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ action: 'set_ingest' })
    );
    expect(mocks.promoteExternalChatCredential).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('ecs_test_secret');
  });
});
