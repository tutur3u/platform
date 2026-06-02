import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  buildAgentPayload,
  getAiAgentWorkspaceSearchValue,
  mergeInternalAiAgentWorkspaceOption,
  SECRET_CLEAR_VALUE,
} from './ai-agents-utils';

describe('AI agent settings payload builder', () => {
  it('builds Discord and Zalo channel payloads from the dense admin form', () => {
    const formData = new FormData();
    formData.set('id', 'support');
    formData.set('name', 'Support Agent');
    formData.set('enabled', 'on');
    formData.set('workspaceId', 'workspace-1');
    formData.set('modelId', 'google/gemini-3.1-flash-lite');
    formData.set('instructions', 'Help users.');
    formData.set('discordDisplayName', 'Discord');
    formData.set('discordEnabled', 'on');
    formData.set('discordAutoRespond', 'on');
    formData.set('discordHistorySyncEnabled', 'on');
    formData.set('discordExternalChannelId', 'channel-1');
    formData.set('discordGuildId', 'guild-1');
    formData.set('discordMentionRoleIds', 'role-1\nrole-2');
    formData.set('discordApplicationId', 'app-1');
    formData.set('discordPublicKey', 'public-key');
    formData.set('discordBotToken', 'discord-token');
    formData.set('zaloDisplayName', 'Zalo');
    formData.set('zaloEnabled', 'on');
    formData.set('zaloAutoRespond', 'on');
    formData.set('zaloHistorySyncEnabled', 'on');
    formData.set('zaloExternalChannelId', 'oa-thread');
    formData.set('zaloOfficialAccountId', 'oa-1');
    formData.set('zaloBotToken', 'zalo-token');
    formData.set('zaloWebhookSecret', 'zalo-secret');

    expect(buildAgentPayload(formData)).toMatchObject({
      channels: [
        {
          adapter: 'discord',
          autoRespond: true,
          discordGuildId: 'guild-1',
          externalChannelId: 'channel-1',
          historySyncEnabled: true,
          id: 'support-discord',
          mentionRoleIds: ['role-1', 'role-2'],
          secrets: {
            applicationId: 'app-1',
            botToken: 'discord-token',
            publicKey: 'public-key',
          },
          workspaceId: 'workspace-1',
        },
        {
          adapter: 'zalo',
          autoRespond: true,
          externalChannelId: 'oa-thread',
          historySyncEnabled: true,
          id: 'support-zalo',
          secrets: {
            botToken: 'zalo-token',
            webhookSecret: 'zalo-secret',
          },
          workspaceId: 'workspace-1',
          zaloOfficialAccountId: 'oa-1',
        },
      ],
      enabled: true,
      id: 'support',
      instructions: 'Help users.',
      name: 'Support Agent',
    });
  });

  it('keeps blank secrets unchanged and sends the clear sentinel as null', () => {
    const formData = new FormData();
    formData.set('id', 'support');
    formData.set('name', 'Support Agent');
    formData.set('workspaceId', 'workspace-1');
    formData.set('discordDisplayName', 'Discord');
    formData.set('discordEnabled', 'on');
    formData.set('discordApplicationId', SECRET_CLEAR_VALUE);
    formData.set('discordPublicKey', '');
    formData.set('discordBotToken', 'new-token');
    formData.set('zaloDisplayName', 'Zalo');

    const payload = buildAgentPayload(formData);

    expect(payload.channels?.[0]?.secrets).toMatchObject({
      applicationId: null,
      botToken: 'new-token',
      publicKey: undefined,
    });
  });

  it('adds a searchable root internal workspace option only when requested', () => {
    const workspace = {
      avatar_url: null,
      id: 'workspace-1',
      logo_url: null,
      name: 'Customer workspace',
      personal: false,
    };

    expect(
      mergeInternalAiAgentWorkspaceOption([workspace], {
        includeInternal: false,
      })
    ).toEqual([workspace]);

    const options = mergeInternalAiAgentWorkspaceOption([workspace], {
      includeInternal: true,
      label: 'Internal',
    });

    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      id: ROOT_WORKSPACE_ID,
      name: 'Internal',
      personal: false,
    });
    expect(getAiAgentWorkspaceSearchValue(options[0]!)).toContain('internal');
    expect(getAiAgentWorkspaceSearchValue(options[0]!)).toContain('root');
    expect(getAiAgentWorkspaceSearchValue(options[0]!)).toContain(
      ROOT_WORKSPACE_ID
    );
  });
});
