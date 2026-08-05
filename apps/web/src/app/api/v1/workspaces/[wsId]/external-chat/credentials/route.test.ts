import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  clearExternalChatCredential: vi.fn(),
  configureExternalChatBridge: vi.fn(),
  issueExternalChatPairingTicket: vi.fn(),
  markExternalChatCredentialVerified: vi.fn(),
  readExternalChatBinding: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serializeExternalChatBinding: vi.fn(),
  stageExternalChatCredential: vi.fn(),
  promoteExternalChatCredential: vi.fn(),
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
  verifyExternalChatSecret: vi.fn(() => true),
}));

vi.mock('@/lib/external-chat/delivery', () => ({
  configureExternalChatBridge: (...args: unknown[]) =>
    mocks.configureExternalChatBridge(...args),
  updateExternalChatBridgeCredential: (...args: unknown[]) =>
    mocks.updateExternalChatBridgeCredential(...args),
  verifyExternalChatControl: (...args: unknown[]) =>
    mocks.verifyExternalChatControl(...args),
}));

vi.mock('@/lib/external-chat/store', () => ({
  clearExternalChatCredential: (...args: unknown[]) =>
    mocks.clearExternalChatCredential(...args),
  issueExternalChatPairingTicket: (...args: unknown[]) =>
    mocks.issueExternalChatPairingTicket(...args),
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
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.configureExternalChatBridge.mockResolvedValue(undefined);
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'encrypted-control',
      },
    });
    mocks.markExternalChatCredentialVerified.mockResolvedValue(true);
    mocks.promoteExternalChatCredential.mockResolvedValue(undefined);
    mocks.serializeExternalChatBinding.mockReturnValue({
      readiness: { errors: [], ready: true },
    });
    mocks.updateExternalChatBridgeCredential.mockResolvedValue(undefined);
    mocks.verifyExternalChatControl.mockResolvedValue(undefined);
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
      'encrypted-control',
      3
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
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'encrypted',
        verified_at: '2026-08-05T00:00:00.000Z',
        verified_revision: 3,
      },
    });
    mocks.updateExternalChatBridgeCredential.mockRejectedValue(
      new Error('bridge unavailable')
    );
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'rotate_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(202);
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
    expect(await response.json()).toMatchObject({ secret: 'ecs_test_secret' });
  });

  it('rotates ingest locally when the binding must be re-paired', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'stale-encrypted-control',
        verified_at: null,
        verified_revision: null,
      },
    });
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'rotate_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateExternalChatBridgeCredential).not.toHaveBeenCalled();
    expect(mocks.promoteExternalChatCredential).toHaveBeenCalledWith(
      'workspace-1',
      'set_ingest',
      'encrypted-pending'
    );
  });

  it('replaces an unverified local control credential before re-pairing', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'stale-encrypted-control',
        verified_at: null,
        verified_revision: null,
      },
    });
    const { POST } = await import('./route');
    const response = await POST(
      request({
        action: 'set_control',
        secret: 'replacement-control-secret',
      }) as never,
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateExternalChatBridgeCredential).not.toHaveBeenCalled();
    expect(mocks.promoteExternalChatCredential).toHaveBeenCalledWith(
      'workspace-1',
      'rotate_control',
      'encrypted-pending'
    );
  });

  it('requires remote rotation while the current control credential is verified', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'verified-encrypted-control',
        verified_at: '2026-08-05T00:00:00.000Z',
        verified_revision: 3,
      },
    });
    const { POST } = await import('./route');
    const response = await POST(
      request({
        action: 'set_control',
        secret: 'replacement-control-secret',
      }) as never,
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateExternalChatBridgeCredential).toHaveBeenCalledWith({
      action: 'rotate_control',
      secret: 'replacement-control-secret',
      wsId: 'workspace-1',
    });
  });

  it('pairs with a transient single-use ticket and verifies before marking ready', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 4,
        control_secret_encrypted: 'encrypted-control',
        ingest_secret_hash: 'ingest-hash',
      },
    });
    const { POST } = await import('./route');
    const response = await POST(
      request({
        action: 'pair',
        ingestSecret: 'ingest-secret-value-123456789',
      }) as never,
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.issueExternalChatPairingTicket).toHaveBeenCalledWith(
      'workspace-1',
      'h'.repeat(64),
      expect.any(String)
    );
    expect(mocks.configureExternalChatBridge).toHaveBeenCalledWith({
      ingestSecret: 'ingest-secret-value-123456789',
      pairingTicket: 'ecs_test_secret',
      wsId: 'workspace-1',
    });
    expect(mocks.verifyExternalChatControl).toHaveBeenCalledWith('workspace-1');
    expect(mocks.markExternalChatCredentialVerified).toHaveBeenCalledWith(
      'workspace-1',
      'encrypted-control',
      4
    );
    const responseText = await response.text();
    expect(responseText).not.toContain('ecs_test_secret');
    expect(responseText).not.toContain('ingest-secret-value-123456789');
  });

  it('does not leak pairing material when ticket configuration fails', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 4,
        control_secret_encrypted: 'encrypted-control',
        ingest_secret_hash: 'ingest-hash',
      },
    });
    mocks.configureExternalChatBridge.mockRejectedValue(
      new Error('ecs_test_secret')
    );
    const { POST } = await import('./route');
    const response = await POST(
      request({
        action: 'pair',
        ingestSecret: 'ingest-secret-value-123456789',
      }) as never,
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(502);
    const responseText = await response.text();
    expect(responseText).not.toContain('ecs_test_secret');
    expect(responseText).not.toContain('ingest-secret-value-123456789');
    expect(mocks.markExternalChatCredentialVerified).not.toHaveBeenCalled();
  });

  it('discards a matching pending rotation when clearing an unpaired credential', async () => {
    const pendingState = {
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: null,
        pending_action: 'set_ingest',
        pending_secret_encrypted: 'encrypted-pending',
      },
    };
    const clearedState = {
      binding: {},
      credentials: {
        configuration_revision: 4,
        control_secret_encrypted: null,
        pending_action: null,
        pending_secret_encrypted: null,
      },
    };
    mocks.readExternalChatBinding
      .mockResolvedValueOnce(pendingState)
      .mockResolvedValueOnce(clearedState);

    const { POST } = await import('./route');
    const response = await POST(request({ action: 'clear_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.promoteExternalChatCredential).not.toHaveBeenCalled();
    expect(mocks.clearExternalChatCredential).toHaveBeenCalledWith(
      'workspace-1',
      'ingest'
    );
  });

  it('returns a masked conflict when an active pairing blocks credential clearing', async () => {
    mocks.clearExternalChatCredential.mockRejectedValue(
      new Error('external_chat_pairing_in_progress')
    );
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'clear_control' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(
      'external_chat_pairing_in_progress'
    );
  });

  it('returns a masked conflict when credential rotation overlaps pairing', async () => {
    mocks.stageExternalChatCredential.mockRejectedValue(
      new Error('external_chat_pairing_in_progress')
    );
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'rotate_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(409);
    const responseText = await response.text();
    expect(responseText).not.toContain('external_chat_pairing_in_progress');
    expect(responseText).toContain('ecs_test_secret');
  });

  it('stages paired revocation before applying it remotely and locally', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'encrypted-control',
        pairing_ticket_consumed_at: '2026-08-01T00:00:00.000Z',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(request({ action: 'clear_control' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.stageExternalChatCredential).toHaveBeenCalledWith(
      'workspace-1',
      {
        action: 'clear_control',
        encrypted: 'external-chat-clear',
        hash: null,
        lastFour: '',
      }
    );
    expect(mocks.updateExternalChatBridgeCredential).toHaveBeenCalledWith({
      action: 'clear_control',
      wsId: 'workspace-1',
    });
    expect(mocks.promoteExternalChatCredential).toHaveBeenCalledWith(
      'workspace-1',
      'clear_control',
      'external-chat-clear'
    );
    expect(mocks.clearExternalChatCredential).not.toHaveBeenCalled();
  });

  it('keeps local credentials when remote revocation fails', async () => {
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {},
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'encrypted-control',
        verified_at: '2026-08-01T00:00:00.000Z',
      },
    });
    mocks.updateExternalChatBridgeCredential.mockRejectedValue(
      new Error('bridge unavailable')
    );

    const { POST } = await import('./route');
    const response = await POST(request({ action: 'clear_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(502);
    expect(mocks.clearExternalChatCredential).not.toHaveBeenCalled();
    expect(mocks.stageExternalChatCredential).toHaveBeenCalled();
    expect(mocks.promoteExternalChatCredential).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('bridge unavailable');
  });

  it('returns a masked conflict when promotion loses its compare-and-swap', async () => {
    mocks.promoteExternalChatCredential.mockRejectedValue(
      new Error('external_chat_pending_credential_changed')
    );
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'rotate_ingest' }) as never, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'External chat credential changed during rotation',
      secret: 'ecs_test_secret',
    });
  });
});
