import 'server-only';

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { listAiAgents } from '@/lib/ai-agents/registry';
import type { ChatConversation, ChatMessage } from './private-rpc';

function agentChannelTimestamp(
  agent: Awaited<ReturnType<typeof listAiAgents>>[number],
  channel: Awaited<ReturnType<typeof listAiAgents>>[number]['channels'][number]
) {
  return (
    channel.lastEventAt ||
    channel.lastDeployedAt ||
    agent.updatedAt ||
    agent.createdAt ||
    new Date(0).toISOString()
  );
}

function buildVirtualAgentMessage({
  agent,
  channel,
  conversationId,
}: {
  agent: Awaited<ReturnType<typeof listAiAgents>>[number];
  channel: Awaited<ReturnType<typeof listAiAgents>>[number]['channels'][number];
  conversationId: string;
}): ChatMessage {
  const timestamp = agentChannelTimestamp(agent, channel);

  return {
    attachments: [],
    content: `${channel.displayName} is a read-only ${channel.adapter} AI agent channel. Manage credentials and deployment from Infrastructure > AI Agents.`,
    conversationId,
    createdAt: timestamp,
    deletedAt: null,
    editedAt: null,
    id: `${conversationId}-status`,
    kind: 'system',
    metadata: {
      adapter: channel.adapter,
      agentId: agent.id,
      channelId: channel.id,
      readOnly: true,
      source: 'ai-agent',
      status: channel.status,
      webhookUrl: channel.webhookUrl,
    },
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: null,
    updatedAt: null,
  };
}

export async function listRootAiAgentDiscoveryConversations({
  wsId,
}: {
  wsId: string;
}): Promise<ChatConversation[]> {
  if (wsId !== ROOT_WORKSPACE_ID) {
    return [];
  }

  const agents = await listAiAgents();

  return agents.flatMap((agent) => {
    if (!agent.enabled) {
      return [];
    }

    return agent.channels
      .filter((channel) => channel.enabled)
      .map((channel): ChatConversation => {
        const id = `ai-agent-${agent.id}-${channel.id}`;
        const timestamp = agentChannelTimestamp(agent, channel);
        const latestMessage = buildVirtualAgentMessage({
          agent,
          channel,
          conversationId: id,
        });

        return {
          aiEnabled: true,
          archivedAt: null,
          createdAt: agent.createdAt || timestamp,
          createdBy: null,
          description: `${channel.adapter} channel ${channel.id}`,
          id,
          latestMessage,
          memberCount: 0,
          members: [],
          metadata: {
            adapter: channel.adapter,
            agentId: agent.id,
            channelId: channel.id,
            readOnly: true,
            source: 'ai-agent',
            status: channel.status,
            webhookUrl: channel.webhookUrl,
            workspaceId: channel.workspaceId,
          },
          title: `${agent.name} / ${channel.displayName}`,
          type: 'ai',
          unreadCount: 0,
          updatedAt: timestamp,
          wsId: ROOT_WORKSPACE_ID,
        };
      });
  });
}

export function isReadOnlyAgentConversation(
  conversation: Pick<ChatConversation, 'metadata'>
) {
  return (
    conversation.metadata.source === 'ai-agent' &&
    conversation.metadata.readOnly === true
  );
}
