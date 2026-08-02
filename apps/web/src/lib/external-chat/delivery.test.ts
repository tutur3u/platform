import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateExternalChatBridgeCredential } from './delivery';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  decryptControlSecret: vi.fn(),
  readExternalChatBinding: vi.fn(),
  safeExternalChatFetch: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/next-config', () => ({
  resolveTuturuuuWebAppUrl: vi.fn(),
}));

vi.mock('./crypto', () => ({
  decryptControlSecret: (...args: unknown[]) =>
    mocks.decryptControlSecret(...args),
  signControlRequest: vi.fn(() => 'signature'),
}));

vi.mock('./safe-control-request', () => ({
  safeExternalChatFetch: (...args: unknown[]) =>
    mocks.safeExternalChatFetch(...args),
}));

vi.mock('./store', () => ({
  externalChatPrivateDb: vi.fn(),
  readExternalChatBinding: (...args: unknown[]) =>
    mocks.readExternalChatBinding(...args),
}));

describe('external chat credential delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptControlSecret.mockResolvedValue('control-secret');
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {
        is_enabled: true,
        settings: {
          chat: {
            bridgeBaseUrl: 'https://bridge.example.com',
            enabled: true,
          },
        },
      },
      credentials: { control_secret_encrypted: 'encrypted-control' },
    });
  });

  it.each([401, 403])(
    'completes staged revocation when the old credential returns %s',
    async (status) => {
      mocks.safeExternalChatFetch.mockResolvedValue(
        new Response(null, { status })
      );

      await expect(
        updateExternalChatBridgeCredential({
          action: 'clear_control',
          wsId: 'workspace-1',
        })
      ).resolves.toBeUndefined();
    }
  );

  it('does not accept authentication rejection for credential rotation', async () => {
    mocks.safeExternalChatFetch.mockResolvedValue(
      new Response(null, { status: 401 })
    );

    await expect(
      updateExternalChatBridgeCredential({
        action: 'rotate_control',
        secret: 'next-control-secret',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('credential update failed (401)');
  });

  it('keeps a staged clear pending on server failure', async () => {
    mocks.safeExternalChatFetch.mockResolvedValue(
      new Response(null, { status: 503 })
    );

    await expect(
      updateExternalChatBridgeCredential({
        action: 'clear_ingest',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('credential update failed (503)');
  });
});
