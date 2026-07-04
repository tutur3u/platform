import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOperationsPanel } from './chat-agent-details-operations-panel';

const mocks = vi.hoisted(() => ({
  abortAiAgentZaloPersonalQrLogin: vi.fn(),
  getAiAgentZaloPersonalQrLoginStatus: vi.fn(),
  getAiAgentZaloPersonalStatus: vi.fn(),
  runAiAgentZaloPersonalAction: vi.fn(),
  startAiAgentZaloPersonalQrLogin: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/infrastructure/ai', () => ({
  abortAiAgentZaloPersonalQrLogin: (
    ...args: Parameters<typeof mocks.abortAiAgentZaloPersonalQrLogin>
  ) => mocks.abortAiAgentZaloPersonalQrLogin(...args),
  getAiAgentZaloPersonalQrLoginStatus: (
    ...args: Parameters<typeof mocks.getAiAgentZaloPersonalQrLoginStatus>
  ) => mocks.getAiAgentZaloPersonalQrLoginStatus(...args),
  getAiAgentZaloPersonalStatus: (
    ...args: Parameters<typeof mocks.getAiAgentZaloPersonalStatus>
  ) => mocks.getAiAgentZaloPersonalStatus(...args),
  runAiAgentZaloPersonalAction: (
    ...args: Parameters<typeof mocks.runAiAgentZaloPersonalAction>
  ) => mocks.runAiAgentZaloPersonalAction(...args),
  startAiAgentZaloPersonalQrLogin: (
    ...args: Parameters<typeof mocks.startAiAgentZaloPersonalQrLogin>
  ) => mocks.startAiAgentZaloPersonalQrLogin(...args),
}));

vi.mock('../sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: (...args: Parameters<typeof mocks.toastWarning>) =>
      mocks.toastWarning(...args),
  },
}));

const channel = {
  adapter: 'discord' as const,
  autoRespond: true,
  discordGuildId: 'guild-1',
  displayName: 'Discord',
  enabled: true,
  externalChannelId: 'channel-1',
  historySyncEnabled: true,
  id: 'channel-1',
  lastDeployedAt: '2026-06-02T00:00:00.000Z',
  lastError: null,
  lastEventAt: '2026-06-02T00:01:00.000Z',
  mentionRoleIds: [],
  secrets: [],
  status: 'deployed' as const,
  webhookUrl: 'https://example.com/webhook',
  workspaceId: 'workspace-1',
};

describe('AgentOperationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAiAgentZaloPersonalAction.mockResolvedValue({
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
      sync: {
        exhausted: true,
        failedGroupHistories: 0,
        groupMessages: 0,
        groupsScanned: 0,
        pageCount: 1,
        synced: 2,
        threads: 1,
        timedOut: false,
        userMessages: 2,
      },
    });
  });

  it('renders personal Zalo QR controls instead of webhook secret rotation', () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      status: {
        channelId: 'channel-1',
        connected: false,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: false,
        startedAt: null,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AgentOperationsPanel
          agentId="agent-1"
          channel={{
            ...channel,
            adapter: 'zalo',
            displayName: 'Personal Zalo',
            webhookUrl: null,
            zaloAccountMode: 'personal',
            zaloPersonalOwnId: 'own-1',
          }}
          isPending={false}
          onCopySecret={vi.fn()}
          onDeploy={vi.fn()}
          onPause={vi.fn()}
          onRefresh={vi.fn()}
          onRotateSecret={vi.fn()}
          onTest={vi.fn()}
          secretPreview={null}
          testResult={null}
        />
      </QueryClientProvider>
    );

    expect(
      screen.getByText('agent_zalo_personal_qr_title')
    ).toBeInTheDocument();
    expect(screen.queryByText('agent_rotate_secret')).not.toBeInTheDocument();
  });

  it('runs personal Zalo historical sync from the operations panel', async () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AgentOperationsPanel
          agentId="agent-1"
          channel={{
            ...channel,
            adapter: 'zalo',
            displayName: 'Personal Zalo',
            webhookUrl: null,
            zaloAccountMode: 'personal',
            zaloPersonalOwnId: 'own-1',
          }}
          isPending={false}
          onCopySecret={vi.fn()}
          onDeploy={vi.fn()}
          onPause={vi.fn()}
          onRefresh={vi.fn()}
          onRotateSecret={vi.fn()}
          onTest={vi.fn()}
          secretPreview={null}
          testResult={null}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('agent_zalo_personal_sync_history'));

    await waitFor(() => {
      expect(mocks.runAiAgentZaloPersonalAction).toHaveBeenCalledWith(
        'agent-1',
        'channel-1',
        'sync-history'
      );
    });
  });

  it('runs personal Zalo phone-approved transfer sync from the operations panel', async () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
    });
    mocks.runAiAgentZaloPersonalAction.mockResolvedValueOnce({
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
      sync: {
        approvalRequested: true,
        cleaned: true,
        error: null,
        groupMessages: 1,
        pullAttempts: 1,
        requestAccepted: true,
        requestHttpError: null,
        requestViaHttp: true,
        requestViaWebSocket: true,
        status: 'completed',
        synced: 3,
        threads: 2,
        userMessages: 2,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AgentOperationsPanel
          agentId="agent-1"
          channel={{
            ...channel,
            adapter: 'zalo',
            displayName: 'Personal Zalo',
            webhookUrl: null,
            zaloAccountMode: 'personal',
            zaloPersonalOwnId: 'own-1',
          }}
          isPending={false}
          onCopySecret={vi.fn()}
          onDeploy={vi.fn()}
          onPause={vi.fn()}
          onRefresh={vi.fn()}
          onRotateSecret={vi.fn()}
          onTest={vi.fn()}
          secretPreview={null}
          testResult={null}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('agent_zalo_personal_sync_phone'));

    await waitFor(() => {
      expect(mocks.runAiAgentZaloPersonalAction).toHaveBeenCalledWith(
        'agent-1',
        'channel-1',
        'sync-phone'
      );
    });
  });

  it('keeps personal Zalo actions busy while a phone sync job is running', async () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      phoneSyncJob: {
        completedAt: null,
        error: null,
        startedAt: '2026-06-02T00:00:00.000Z',
        status: 'running',
        sync: null,
      },
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: 'zalo_personal_phone_sync_waiting_for_phone',
        lastEventAt: '2026-06-02T00:00:00.000Z',
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AgentOperationsPanel
          agentId="agent-1"
          channel={{
            ...channel,
            adapter: 'zalo',
            displayName: 'Personal Zalo',
            webhookUrl: null,
            zaloAccountMode: 'personal',
            zaloPersonalOwnId: 'own-1',
          }}
          isPending={false}
          onCopySecret={vi.fn()}
          onDeploy={vi.fn()}
          onPause={vi.fn()}
          onRefresh={vi.fn()}
          onRotateSecret={vi.fn()}
          onTest={vi.fn()}
          secretPreview={null}
          testResult={null}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('agent_zalo_personal_sync_phone').closest('button')
      ).toBeDisabled();
    });
    expect(
      screen.getByText('agent_zalo_personal_sync_phone_waiting')
    ).toBeInTheDocument();
  });

  it('warns when personal Zalo phone transfer is approved but returns no payload', async () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
    });
    mocks.runAiAgentZaloPersonalAction.mockResolvedValueOnce({
      status: {
        channelId: 'channel-1',
        connected: true,
        enabled: true,
        lastError: 'zalo_personal_phone_sync_no_payload',
        lastEventAt: null,
        mode: 'personal',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-02T00:00:00.000Z',
      },
      sync: {
        approvalRequested: true,
        cleaned: false,
        error: null,
        groupMessages: 0,
        pullAttempts: 90,
        requestAccepted: true,
        requestHttpError: 'Request failed with status code 404',
        requestViaHttp: false,
        requestViaWebSocket: true,
        status: 'completed_no_payload',
        synced: 0,
        threads: 0,
        userMessages: 0,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AgentOperationsPanel
          agentId="agent-1"
          channel={{
            ...channel,
            adapter: 'zalo',
            displayName: 'Personal Zalo',
            webhookUrl: null,
            zaloAccountMode: 'personal',
            zaloPersonalOwnId: 'own-1',
          }}
          isPending={false}
          onCopySecret={vi.fn()}
          onDeploy={vi.fn()}
          onPause={vi.fn()}
          onRefresh={vi.fn()}
          onRotateSecret={vi.fn()}
          onTest={vi.fn()}
          secretPreview={null}
          testResult={null}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('agent_zalo_personal_sync_phone'));

    await waitFor(() => {
      expect(mocks.toastWarning).toHaveBeenCalledWith(
        'agent_zalo_personal_sync_phone_no_payload'
      );
    });
  });

  it('formats personal Zalo channel error codes for display', () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      status: {
        channelId: 'channel-1',
        connected: false,
        enabled: true,
        lastError: null,
        lastEventAt: null,
        mode: 'personal',
        ownId: null,
        running: false,
        startedAt: null,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AgentOperationsPanel
          agentId="agent-1"
          channel={{
            ...channel,
            adapter: 'zalo',
            displayName: 'Personal Zalo',
            lastError: 'zalo_personal_qr_expired',
            webhookUrl: null,
            zaloAccountMode: 'personal',
          }}
          isPending={false}
          onCopySecret={vi.fn()}
          onDeploy={vi.fn()}
          onPause={vi.fn()}
          onRefresh={vi.fn()}
          onRotateSecret={vi.fn()}
          onTest={vi.fn()}
          secretPreview={null}
          testResult={null}
        />
      </QueryClientProvider>
    );

    expect(
      screen.getByText('agent_zalo_personal_qr_expired')
    ).toBeInTheDocument();
    expect(screen.queryByText('zalo_personal_qr_expired')).toBeNull();
  });

  it('renders structured diagnostics after a channel test', () => {
    render(
      <AgentOperationsPanel
        agentId="agent-1"
        channel={channel}
        isPending={false}
        onCopySecret={vi.fn()}
        onDeploy={vi.fn()}
        onPause={vi.fn()}
        onRefresh={vi.fn()}
        onRotateSecret={vi.fn()}
        onTest={vi.fn()}
        secretPreview={null}
        testResult={{
          checks: [
            {
              detail: 'All required channel secrets are configured.',
              id: 'required_secrets',
              label: 'Required secrets',
              ok: true,
            },
            {
              detail: 'Set the Discord guild ID.',
              id: 'adapter_account',
              label: 'Discord guild mapping',
              ok: false,
            },
          ],
          ok: false,
          response: 'AI agent channel needs attention.',
        }}
      />
    );

    expect(screen.getByText('agent_diagnostics')).toBeInTheDocument();
    expect(
      screen.getByText('agent_diagnostic_required_secrets')
    ).toBeInTheDocument();
    expect(
      screen.getByText('agent_diagnostic_adapter_account')
    ).toBeInTheDocument();
    expect(screen.getByText('Set the Discord guild ID.')).toBeInTheDocument();
  });
});
