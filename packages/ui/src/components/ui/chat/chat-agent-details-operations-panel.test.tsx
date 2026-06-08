import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOperationsPanel } from './chat-agent-details-operations-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
  it('renders structured diagnostics after a channel test', () => {
    render(
      <AgentOperationsPanel
        channel={channel}
        isPending={false}
        onCopySecret={vi.fn()}
        onDeploy={vi.fn()}
        onPause={vi.fn()}
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
