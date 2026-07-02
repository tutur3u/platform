import type { ZaloPersonalQrLoginEvent } from '@tuturuuu/ai/chat-sdk/zalo-personal';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getAiAgentById: vi.fn(),
  isAiAgentZaloPersonalEnabled: vi.fn(),
  loginZaloPersonalWithQr: vi.fn(),
  recordAiAgentZaloPersonalConnection: vi.fn(),
  rotateAiAgentChannelSecret: vi.fn(),
}));

vi.mock('@tuturuuu/ai/chat-sdk/zalo-personal', () => ({
  loginZaloPersonalWithQr: (
    ...args: Parameters<typeof mocks.loginZaloPersonalWithQr>
  ) => mocks.loginZaloPersonalWithQr(...args),
}));

vi.mock('./registry', () => ({
  getAiAgentById: (...args: Parameters<typeof mocks.getAiAgentById>) =>
    mocks.getAiAgentById(...args),
  isAiAgentZaloPersonalEnabled: (
    ...args: Parameters<typeof mocks.isAiAgentZaloPersonalEnabled>
  ) => mocks.isAiAgentZaloPersonalEnabled(...args),
  recordAiAgentZaloPersonalConnection: (
    ...args: Parameters<typeof mocks.recordAiAgentZaloPersonalConnection>
  ) => mocks.recordAiAgentZaloPersonalConnection(...args),
  rotateAiAgentChannelSecret: (
    ...args: Parameters<typeof mocks.rotateAiAgentChannelSecret>
  ) => mocks.rotateAiAgentChannelSecret(...args),
}));

import {
  abortAiAgentZaloPersonalQrLogin,
  getAiAgentZaloPersonalQrLoginStatus,
  startAiAgentZaloPersonalQrLogin,
} from './zalo-personal-qr-login';

const baseAgent = {
  channels: [
    {
      adapter: 'zalo' as const,
      autoRespond: true,
      displayName: 'Personal Zalo',
      enabled: true,
      externalChannelId: null,
      historySyncEnabled: true,
      id: 'channel-1',
      lastDeployedAt: null,
      lastError: null,
      lastEventAt: null,
      mentionRoleIds: [],
      secrets: [],
      status: 'deployed' as const,
      webhookUrl: null,
      workspaceId: 'workspace-1',
      zaloAccountMode: 'personal' as const,
      zaloPersonalOwnId: null,
    },
  ],
  createdAt: null,
  enabled: true,
  id: 'agent-1',
  instructions: 'Help mapped Zalo users.',
  modelId: 'google/gemini-3.1-flash-lite',
  name: 'Zalo Agent',
  temperature: null,
  tools: [],
  updatedAt: null,
};

function qrActions() {
  return {
    abort: vi.fn(),
    retry: vi.fn(),
  };
}

function qrGenerated(actions = qrActions()): ZaloPersonalQrLoginEvent {
  return {
    actions,
    expiresAt: '2026-06-09T16:00:00.000Z',
    qrImageDataUrl: 'data:image/png;base64,qr-image',
    type: 'qr_generated',
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('personal Zalo QR login sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiAgentById.mockResolvedValue(baseAgent);
    mocks.isAiAgentZaloPersonalEnabled.mockResolvedValue(true);
    mocks.recordAiAgentZaloPersonalConnection.mockResolvedValue(undefined);
    mocks.rotateAiAgentChannelSecret.mockResolvedValue({
      lastFour: 'last',
      name: 'personalCookieJson',
      value: 'saved',
    });
  });

  it('returns a generated QR snapshot without sensitive credentials', async () => {
    mocks.loginZaloPersonalWithQr.mockImplementation(
      (
        _options: unknown,
        onEvent: (event: ZaloPersonalQrLoginEvent) => void
      ) => {
        onEvent(qrGenerated());

        return new Promise(() => undefined);
      }
    );

    const session = await startAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });

    expect(session).toMatchObject({
      qrImageDataUrl: 'data:image/png;base64,qr-image',
      status: 'qr_generated',
    });
    expect(JSON.stringify(session)).not.toContain('personalCookieJson');
    expect(JSON.stringify(session)).not.toContain('personalImei');
    expect(JSON.stringify(session)).not.toContain('personalUserAgent');
  });

  it('reports scanned QR status before credentials are confirmed', async () => {
    mocks.loginZaloPersonalWithQr.mockImplementation(
      (
        _options: unknown,
        onEvent: (event: ZaloPersonalQrLoginEvent) => void
      ) => {
        onEvent(qrGenerated());
        onEvent({
          actions: qrActions(),
          scannedProfile: {
            avatar: 'https://avatar.test/a.png',
            displayName: 'Scanner',
          },
          type: 'qr_scanned',
        });

        return new Promise(() => undefined);
      }
    );

    const session = await startAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });

    expect(session).toMatchObject({
      scannedProfile: {
        avatar: 'https://avatar.test/a.png',
        displayName: 'Scanner',
      },
      status: 'scanned',
    });
  });

  it('persists QR credentials and own ID after successful confirmation', async () => {
    const stop = vi.fn();
    mocks.loginZaloPersonalWithQr.mockImplementation(
      async (
        _options: unknown,
        onEvent: (event: ZaloPersonalQrLoginEvent) => void
      ) => {
        onEvent(qrGenerated());
        onEvent({ type: 'credentials_ready' });

        return {
          api: {
            listener: {
              stop,
            },
          },
          credentials: {
            cookieJson: '[{"key":"zpsid","value":"cookie"}]',
            imei: 'imei-secret',
            userAgent: 'agent-secret',
          },
          ownId: 'own-1',
        };
      }
    );

    const session = await startAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });
    await flushAsyncWork();
    const latest = await getAiAgentZaloPersonalQrLoginStatus({
      agentId: 'agent-1',
      channelId: 'channel-1',
      sessionId: session.sessionId,
    });

    expect(latest).toMatchObject({
      ownId: 'own-1',
      qrImageDataUrl: null,
      status: 'persisted',
    });
    expect(mocks.rotateAiAgentChannelSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secretName: 'personalCookieJson',
        value: '[{"key":"zpsid","value":"cookie"}]',
      })
    );
    expect(mocks.rotateAiAgentChannelSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secretName: 'personalImei',
        value: 'imei-secret',
      })
    );
    expect(mocks.rotateAiAgentChannelSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secretName: 'personalUserAgent',
        value: 'agent-secret',
      })
    );
    expect(mocks.recordAiAgentZaloPersonalConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        ownId: 'own-1',
      })
    );
    expect(JSON.stringify(latest)).not.toContain('cookie');
    expect(JSON.stringify(latest)).not.toContain('imei-secret');
    expect(JSON.stringify(latest)).not.toContain('agent-secret');
    expect(stop).toHaveBeenCalled();
  });

  it('tracks declined and expired QR outcomes', async () => {
    mocks.loginZaloPersonalWithQr.mockImplementation(
      async (
        _options: unknown,
        onEvent: (event: ZaloPersonalQrLoginEvent) => void
      ) => {
        onEvent({
          actions: qrActions(),
          type: 'qr_declined',
        });
        throw new Error('zalo_personal_qr_declined');
      }
    );

    const declined = await startAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });
    await flushAsyncWork();

    expect(declined).toMatchObject({
      error: 'zalo_personal_qr_declined',
      status: 'declined',
    });

    mocks.loginZaloPersonalWithQr.mockImplementation(
      async (
        _options: unknown,
        onEvent: (event: ZaloPersonalQrLoginEvent) => void
      ) => {
        onEvent({
          actions: qrActions(),
          type: 'qr_expired',
        });
        throw new Error('zalo_personal_qr_expired');
      }
    );

    const expired = await startAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });
    await flushAsyncWork();

    expect(expired).toMatchObject({
      error: 'zalo_personal_qr_expired',
      status: 'expired',
    });
  });

  it('aborts an active QR session', async () => {
    const actions = qrActions();
    mocks.loginZaloPersonalWithQr.mockImplementation(
      (
        _options: unknown,
        onEvent: (event: ZaloPersonalQrLoginEvent) => void
      ) => {
        onEvent(qrGenerated(actions));

        return new Promise(() => undefined);
      }
    );

    const session = await startAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });
    const aborted = await abortAiAgentZaloPersonalQrLogin({
      agentId: 'agent-1',
      channelId: 'channel-1',
      sessionId: session.sessionId,
    });

    expect(aborted).toMatchObject({
      error: 'zalo_personal_qr_aborted',
      qrImageDataUrl: null,
      status: 'aborted',
    });
    expect(actions.abort).toHaveBeenCalled();
  });
});
