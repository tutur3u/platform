import { describe, expect, it } from 'vitest';
import {
  buildAgentDefinitions,
  buildWebhookUrl,
  channelMetaKey,
  channelSecretKey,
  FIELD_VALUE_LIMIT,
  getRequiredSecrets,
  parseAgentRowName,
  splitLongValue,
  stringifyField,
} from './registry-codec';

describe('AI agent registry codec', () => {
  it('preserves camelCase secret names for Chat SDK adapter configuration', () => {
    const key = channelSecretKey('agent', 'zalo-channel', 'webhookSecret');

    expect(key).toBe(
      'AI_AGENT_REGISTRY:agent:channel:zalo-channel:secret:webhookSecret'
    );
    expect(parseAgentRowName(key)).toEqual({
      agentId: 'agent',
      channelId: 'zalo-channel',
      field: 'channelSecret',
      secret: 'webhookSecret',
    });
    expect(getRequiredSecrets('zalo')).toEqual(['botToken', 'webhookSecret']);
    expect(getRequiredSecrets('zalo', 'personal')).toEqual([
      'personalCookieJson',
      'personalImei',
      'personalUserAgent',
    ]);
  });

  it('builds redacted agent definitions from workspace secret rows', () => {
    const agents = buildAgentDefinitions(
      [
        {
          name: 'AI_AGENT_REGISTRY:support:meta',
          value: JSON.stringify({
            id: 'support',
            modelId: 'google/gemini-3.1-flash-lite',
            name: 'Support Agent',
            tools: ['create_task', 'delete_task'],
          }),
        },
        {
          name: 'AI_AGENT_REGISTRY:support:instructions',
          value: 'Help mapped users.',
        },
        {
          name: channelMetaKey('support', 'zalo-main'),
          value: JSON.stringify({
            adapter: 'zalo',
            displayName: 'Zalo Main',
            status: 'deployed',
            workspaceId: 'workspace-1',
          }),
        },
        {
          name: channelSecretKey('support', 'zalo-main', 'botToken'),
          value: 'zalo-bot-token',
        },
        {
          name: channelSecretKey('support', 'zalo-main', 'webhookSecret'),
          value: 'zalo-webhook-secret',
        },
      ],
      'https://tuturuuu.com/'
    );

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'support',
      instructions: 'Help mapped users.',
      name: 'Support Agent',
      tools: ['create_task'],
    });
    expect(agents[0]?.channels[0]).toMatchObject({
      adapter: 'zalo',
      autoRespond: true,
      historySyncEnabled: true,
      status: 'deployed',
      webhookUrl:
        'https://tuturuuu.com/api/v1/webhooks/ai-agents/zalo/zalo-main',
      workspaceId: 'workspace-1',
    });
    expect(agents[0]?.channels[0]?.secrets).toEqual([
      { configured: true, lastFour: 'oken', name: 'botToken' },
      { configured: true, lastFour: 'cret', name: 'webhookSecret' },
    ]);
    expect(JSON.stringify(agents)).not.toContain('zalo-webhook-secret');
  });

  it('builds personal Zalo channel definitions with personal required secrets', () => {
    const agents = buildAgentDefinitions([
      {
        name: 'AI_AGENT_REGISTRY:support:meta',
        value: JSON.stringify({ id: 'support', name: 'Support Agent' }),
      },
      {
        name: channelMetaKey('support', 'zalo-personal'),
        value: JSON.stringify({
          adapter: 'zalo',
          displayName: 'Personal Zalo',
          status: 'deployed',
          workspaceId: 'workspace-1',
          zaloAccountMode: 'personal',
          zaloPersonalOwnId: 'personal-own-id',
        }),
      },
      {
        name: channelSecretKey(
          'support',
          'zalo-personal',
          'personalCookieJson'
        ),
        value: '[{"name":"zpsid","value":"cookie"}]',
      },
      {
        name: channelSecretKey('support', 'zalo-personal', 'personalImei'),
        value: 'imei-1',
      },
    ]);

    expect(agents[0]?.channels[0]).toMatchObject({
      adapter: 'zalo',
      displayName: 'Personal Zalo',
      zaloAccountMode: 'personal',
      zaloPersonalOwnId: 'personal-own-id',
    });
    expect(agents[0]?.channels[0]?.secrets).toEqual([
      { configured: true, lastFour: 'e"}]', name: 'personalCookieJson' },
      { configured: true, lastFour: 'ei-1', name: 'personalImei' },
      { configured: false, lastFour: null, name: 'personalUserAgent' },
    ]);
  });

  it('preserves external chat setup options in channel metadata', () => {
    const agents = buildAgentDefinitions([
      {
        name: 'AI_AGENT_REGISTRY:support:meta',
        value: JSON.stringify({ id: 'support', name: 'Support Agent' }),
      },
      {
        name: channelMetaKey('support', 'discord-main'),
        value: JSON.stringify({
          adapter: 'discord',
          autoRespond: false,
          displayName: 'Discord Main',
          externalChannelId: 'channel-1',
          historySyncEnabled: false,
          status: 'draft',
          workspaceId: 'workspace-1',
        }),
      },
    ]);

    expect(agents[0]?.channels[0]).toMatchObject({
      autoRespond: false,
      externalChannelId: 'channel-1',
      historySyncEnabled: false,
    });
  });

  it('splits large instructions and validates serialized field size', () => {
    const value = 'a'.repeat(FIELD_VALUE_LIMIT + 12);

    expect(splitLongValue(value)).toEqual([
      'a'.repeat(FIELD_VALUE_LIMIT),
      'a'.repeat(12),
    ]);
    expect(() => stringifyField({ value })).toThrow('field_value_too_large');
  });

  it('builds apps/web webhook URLs without duplicate slashes', () => {
    expect(
      buildWebhookUrl({
        adapter: 'discord',
        channelId: 'discord-main',
        origin: 'https://tuturuuu.com/',
      })
    ).toBe(
      'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/discord-main'
    );
  });
});
