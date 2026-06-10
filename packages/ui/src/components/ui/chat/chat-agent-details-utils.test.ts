import type { ChatConversation } from '@tuturuuu/internal-api';
import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  buildAgentPayload,
  readAgentConversationMetadata,
  secretNamesForChannel,
} from './chat-agent-details-utils';

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
    title: null,
    type: 'ai',
    unreadCount: 0,
    updatedAt: '2026-06-02T00:00:00.000Z',
    wsId: 'workspace-1',
  };
}

describe('readAgentConversationMetadata', () => {
  it('requires admin-visible agent and channel ids', () => {
    expect(
      readAgentConversationMetadata(
        conversation({
          readOnly: true,
          source: 'ai-agent',
        })
      )
    ).toBeNull();
  });

  it('reads external thread metadata for agent operations', () => {
    expect(
      readAgentConversationMetadata(
        conversation({
          agentId: 'agent-1',
          channelId: 'channel-1',
          externalChannelId: 'discord-channel-1',
          externalThreadId: 'discord-thread-1',
          externalThreadUuid: 'thread-uuid-1',
          messageCount: 2,
          readOnly: true,
          source: 'ai-agent-external-thread',
        })
      )
    ).toEqual({
      agentId: 'agent-1',
      channelId: 'channel-1',
      externalChannelId: 'discord-channel-1',
      externalThreadId: 'discord-thread-1',
      externalThreadUuid: 'thread-uuid-1',
      messageCount: 2,
      source: 'ai-agent-external-thread',
    });
  });
});

describe('buildAgentPayload', () => {
  it('preserves channel workspace and behavior fields from apps/chat setup edits', () => {
    const agent: AiAgentDefinition = {
      channels: [
        {
          adapter: 'discord',
          autoRespond: true,
          displayName: 'Discord',
          enabled: true,
          externalChannelId: 'external-channel-1',
          historySyncEnabled: true,
          id: 'discord-channel',
          lastDeployedAt: null,
          lastError: null,
          lastEventAt: null,
          mentionRoleIds: ['role-1'],
          secrets: [],
          status: 'deployed',
          webhookUrl: null,
          workspaceId: ROOT_WORKSPACE_ID,
        },
        {
          adapter: 'zalo',
          autoRespond: false,
          displayName: 'Zalo',
          enabled: false,
          externalChannelId: 'zalo-thread',
          historySyncEnabled: false,
          id: 'zalo-channel',
          lastDeployedAt: null,
          lastError: null,
          lastEventAt: null,
          mentionRoleIds: [],
          secrets: [],
          status: 'paused',
          webhookUrl: null,
          workspaceId: 'workspace-1',
          zaloOfficialAccountId: 'oa-1',
        },
      ],
      createdAt: null,
      enabled: true,
      id: 'agent-1',
      instructions: 'Old instructions',
      modelId: 'old-model',
      name: 'Old name',
      temperature: null,
      tools: ['get_workspace_context'],
      updatedAt: null,
    };
    const formData = new FormData();
    formData.set('agentEnabled', 'on');
    formData.set('name', 'Updated name');
    formData.set('modelId', 'updated-model');
    formData.set('instructions', 'Updated instructions');
    formData.set('channelDisplayName', 'Discord Main');
    formData.set('channelEnabled', 'on');
    formData.set('channelAutoRespond', 'on');
    formData.set('channelHistorySyncEnabled', 'on');
    formData.set('externalChannelId', 'external-channel-2');
    formData.set('workspaceId', ROOT_WORKSPACE_ID);
    formData.set('mentionRoleIds', 'role-2');

    expect(
      buildAgentPayload(formData, agent, agent.channels[0]!)
    ).toMatchObject({
      channels: [
        {
          adapter: 'discord',
          autoRespond: true,
          displayName: 'Discord Main',
          externalChannelId: 'external-channel-2',
          historySyncEnabled: true,
          id: 'discord-channel',
          mentionRoleIds: ['role-2'],
          workspaceId: ROOT_WORKSPACE_ID,
        },
        {
          adapter: 'zalo',
          autoRespond: false,
          externalChannelId: 'zalo-thread',
          historySyncEnabled: false,
          id: 'zalo-channel',
          workspaceId: 'workspace-1',
        },
      ],
      enabled: true,
      id: 'agent-1',
      instructions: 'Updated instructions',
      modelId: 'updated-model',
      name: 'Updated name',
    });
  });

  it('preserves personal Zalo channel mode and credentials when saving setup edits', () => {
    const agent: AiAgentDefinition = {
      channels: [
        {
          adapter: 'zalo',
          autoRespond: true,
          displayName: 'Personal Zalo',
          enabled: true,
          externalChannelId: 'zalo-thread',
          historySyncEnabled: true,
          id: 'zalo-personal',
          lastDeployedAt: null,
          lastError: null,
          lastEventAt: null,
          mentionRoleIds: [],
          secrets: [
            {
              configured: true,
              lastFour: 'json',
              name: 'personalCookieJson',
            },
          ],
          status: 'deployed',
          webhookUrl: null,
          workspaceId: 'workspace-1',
          zaloAccountMode: 'personal',
          zaloPersonalOwnId: 'own-1',
        },
      ],
      createdAt: null,
      enabled: true,
      id: 'agent-1',
      instructions: 'Old instructions',
      modelId: 'old-model',
      name: 'Old name',
      temperature: null,
      tools: [],
      updatedAt: null,
    };
    const formData = new FormData();
    formData.set('agentEnabled', 'on');
    formData.set('name', 'Updated name');
    formData.set('modelId', 'updated-model');
    formData.set('instructions', 'Updated instructions');
    formData.set('channelDisplayName', 'Personal Zalo');
    formData.set('channelEnabled', 'on');
    formData.set('channelAutoRespond', 'on');
    formData.set('channelHistorySyncEnabled', 'on');
    formData.set('externalChannelId', 'zalo-thread');
    formData.set('workspaceId', 'workspace-1');
    formData.set('zaloPersonalOwnId', 'own-1');

    expect(secretNamesForChannel(agent.channels[0]!)).toEqual([
      'personalCookieJson',
      'personalImei',
      'personalUserAgent',
    ]);
    expect(
      buildAgentPayload(formData, agent, agent.channels[0]!)
    ).toMatchObject({
      channels: [
        {
          adapter: 'zalo',
          id: 'zalo-personal',
          zaloAccountMode: 'personal',
          zaloOfficialAccountId: null,
          zaloPersonalOwnId: 'own-1',
        },
      ],
    });
  });
});
