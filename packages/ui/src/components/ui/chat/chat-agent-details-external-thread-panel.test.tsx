import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentExternalThreadPanel } from './chat-agent-details-external-thread-panel';
import type { AgentConversationMetadata } from './chat-agent-details-utils';

const mocks = vi.hoisted(() => ({
  draftAiAgentExternalResponse: vi.fn(),
  listAiAgentExternalThreads: vi.fn(),
  sendAiAgentExternalResponse: vi.fn(),
  syncAiAgentExternalThread: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));

vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  draftAiAgentExternalResponse: (...args: unknown[]) =>
    mocks.draftAiAgentExternalResponse(...args),
  listAiAgentExternalThreads: (...args: unknown[]) =>
    mocks.listAiAgentExternalThreads(...args),
  sendAiAgentExternalResponse: (...args: unknown[]) =>
    mocks.sendAiAgentExternalResponse(...args),
  syncAiAgentExternalThread: (...args: unknown[]) =>
    mocks.syncAiAgentExternalThread(...args),
}));

vi.mock('../sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

function renderPanel(
  onRefresh = vi.fn(),
  metadata: AgentConversationMetadata = {
    agentId: 'agent-1',
    channelId: 'channel-1',
    externalChannelId: 'external-channel-1',
    externalThreadId: 'discord-thread-1',
    externalThreadUuid: 'thread-uuid-1',
    messageCount: 2,
    source: 'ai-agent-external-thread',
  }
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AgentExternalThreadPanel metadata={metadata} onRefresh={onRefresh} />
    </QueryClientProvider>
  );

  return { onRefresh };
}

describe('AgentExternalThreadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.draftAiAgentExternalResponse.mockResolvedValue({
      draft: 'Draft response',
    });
    mocks.listAiAgentExternalThreads.mockResolvedValue({
      threads: [
        {
          externalThreadId: 'discord-thread-1',
          id: 'thread-uuid-1',
          lastSyncedAt: '2026-06-02T01:02:03.000Z',
          messageCount: 2,
        },
      ],
    });
    mocks.sendAiAgentExternalResponse.mockResolvedValue({ ok: true });
    mocks.syncAiAgentExternalThread.mockResolvedValue({ ok: true, synced: 0 });
  });

  it('syncs an external thread and reports zero new messages explicitly', async () => {
    const { onRefresh } = renderPanel();

    await waitFor(() => {
      expect(screen.getByText('2026-06-02T01:02:03.000Z')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('agent_external_sync'));

    await waitFor(() => {
      expect(mocks.syncAiAgentExternalThread).toHaveBeenCalledWith(
        'thread-uuid-1'
      );
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'agent_external_sync_no_new'
    );
    expect(onRefresh).toHaveBeenCalled();
  });

  it('lists and syncs recent threads from an agent setup conversation', async () => {
    const { onRefresh } = renderPanel(vi.fn(), {
      agentId: 'agent-1',
      channelId: 'channel-1',
      source: 'ai-agent' as const,
    });

    await waitFor(() => {
      expect(mocks.listAiAgentExternalThreads).toHaveBeenCalledWith({
        agentId: 'agent-1',
        channelId: 'channel-1',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('discord-thread-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('agent_external_sync'));

    await waitFor(() => {
      expect(mocks.syncAiAgentExternalThread).toHaveBeenCalledWith(
        'thread-uuid-1'
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it('drafts and sends an external response', async () => {
    const { onRefresh } = renderPanel();

    fireEvent.change(
      screen.getByPlaceholderText('agent_external_prompt_placeholder'),
      {
        target: { value: 'Use a concise tone.' },
      }
    );
    fireEvent.click(screen.getByText('agent_external_draft'));

    await waitFor(() => {
      expect(mocks.draftAiAgentExternalResponse).toHaveBeenCalledWith(
        'thread-uuid-1',
        'Use a concise tone.'
      );
    });
    expect(
      screen.getByPlaceholderText('agent_external_draft_placeholder')
    ).toHaveValue('Draft response');

    fireEvent.click(screen.getByText('agent_external_send'));

    await waitFor(() => {
      expect(mocks.sendAiAgentExternalResponse).toHaveBeenCalledWith(
        'thread-uuid-1',
        'Draft response'
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });
});
