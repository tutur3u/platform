import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAgentDetailsSidebar } from './chat-agent-details-sidebar';

const mocks = vi.hoisted(() => ({
  listAiAgents: vi.fn(),
}));

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/infrastructure/ai', () => ({
  abortAiAgentZaloPersonalQrLogin: vi.fn(),
  deployAiAgentChannel: vi.fn(),
  getAiAgentZaloPersonalQrLoginStatus: vi.fn(),
  getAiAgentZaloPersonalStatus: vi.fn(),
  listAiAgents: (...args: unknown[]) => mocks.listAiAgents(...args),
  pauseAiAgentChannel: vi.fn(),
  rotateAiAgentChannelSecret: vi.fn(),
  runAiAgentZaloPersonalAction: vi.fn(),
  saveAiAgent: vi.fn(),
  startAiAgentZaloPersonalQrLogin: vi.fn(),
  testAiAgentChannel: vi.fn(),
}));

function conversation(metadata: Record<string, unknown>): ChatConversation {
  return {
    aiEnabled: true,
    archivedAt: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    createdBy: null,
    description: null,
    id: 'conversation-1',
    latestMessage: null,
    memberCount: 0,
    members: [],
    metadata,
    title: 'Agent channel',
    type: 'ai',
    unreadCount: 0,
    updatedAt: '2026-06-02T00:00:00.000Z',
    wsId: 'workspace-1',
  };
}

function renderSidebar(
  metadata: Record<string, unknown>,
  queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
) {
  render(
    <QueryClientProvider client={queryClient}>
      <ChatAgentDetailsSidebar
        conversation={conversation(metadata)}
        open={true}
      />
    </QueryClientProvider>
  );
}

describe('ChatAgentDetailsSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAiAgents.mockResolvedValue({
      agents: [
        {
          channels: [
            {
              adapter: 'discord',
              autoRespond: true,
              displayName: 'Discord',
              enabled: true,
              externalChannelId: 'external-channel-1',
              historySyncEnabled: true,
              id: 'channel-1',
              mentionRoleIds: [],
              secrets: [],
              status: 'deployed',
              webhookUrl: 'https://example.com/webhook',
              workspaceId: 'workspace-1',
            },
          ],
          createdAt: '2026-06-02T00:00:00.000Z',
          enabled: true,
          id: 'agent-1',
          instructions: 'Help users.',
          modelId: 'google/gemini-3.1-flash-lite',
          name: 'Support Agent',
          temperature: null,
          tools: [],
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('resolves admin metadata into the setup form', async () => {
    renderSidebar({
      agentId: 'agent-1',
      channelId: 'channel-1',
      readOnly: true,
      source: 'ai-agent',
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Support Agent')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Discord')).toBeInTheDocument();
  });

  it('shows permission failures instead of a missing setup message', async () => {
    mocks.listAiAgents.mockRejectedValueOnce(new Error('Forbidden'));

    renderSidebar({
      agentId: 'agent-1',
      channelId: 'channel-1',
      readOnly: true,
      source: 'ai-agent',
    });

    await waitFor(() => {
      expect(screen.getByText('agent_admin_required')).toBeInTheDocument();
    });
    expect(screen.queryByText('agent_not_found')).not.toBeInTheDocument();
  });
});
