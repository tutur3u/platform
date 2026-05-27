'use client';

import { Bot, Cable } from '@tuturuuu/icons';
import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { ChannelStatus } from './channel-status';

type Channel = AiAgentDefinition['channels'][number];

export function DiscordChannelFields({
  agentId,
  channel,
}: {
  agentId?: string;
  channel?: Channel;
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          {t('channels.discord')}
        </div>
        {channel ? <ChannelStatus channel={channel} /> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          defaultValue={channel?.displayName ?? 'Discord'}
          name="discordDisplayName"
          placeholder={t('fields.display_name')}
        />
        <Input
          defaultValue={channel?.discordGuildId ?? ''}
          name="discordGuildId"
          placeholder={t('fields.discord_guild_id')}
        />
        <Input
          name="discordApplicationId"
          placeholder={t('fields.discord_application_id')}
        />
        <Input
          name="discordPublicKey"
          placeholder={t('fields.discord_public_key')}
        />
        <Input
          className="md:col-span-2"
          name="discordBotToken"
          placeholder={t('fields.discord_bot_token')}
          type="password"
        />
      </div>
      <Textarea
        defaultValue={channel?.mentionRoleIds.join('\n') ?? ''}
        name="discordMentionRoleIds"
        placeholder={t('fields.discord_mentions')}
      />
      <div className="flex items-center gap-3">
        <Switch
          defaultChecked={channel?.enabled ?? true}
          id={agentId ? `${agentId}-discordEnabled` : 'new-discordEnabled'}
          name="discordEnabled"
        />
        <Label
          htmlFor={agentId ? `${agentId}-discordEnabled` : 'new-discordEnabled'}
        >
          {t('fields.channel_enabled')}
        </Label>
      </div>
    </div>
  );
}

export function ZaloChannelFields({
  agentId,
  channel,
}: {
  agentId?: string;
  channel?: Channel;
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Cable className="h-4 w-4 text-primary" />
          {t('channels.zalo')}
        </div>
        {channel ? <ChannelStatus channel={channel} /> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          defaultValue={channel?.displayName ?? 'Zalo'}
          name="zaloDisplayName"
          placeholder={t('fields.display_name')}
        />
        <Input
          defaultValue={channel?.zaloOfficialAccountId ?? ''}
          name="zaloOfficialAccountId"
          placeholder={t('fields.zalo_oa_id')}
        />
        <Input
          className="md:col-span-2"
          name="zaloBotToken"
          placeholder={t('fields.zalo_bot_token')}
          type="password"
        />
        <Input
          className="md:col-span-2"
          name="zaloWebhookSecret"
          placeholder={t('fields.zalo_webhook_secret')}
          type="password"
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch
          defaultChecked={channel?.enabled ?? true}
          id={agentId ? `${agentId}-zaloEnabled` : 'new-zaloEnabled'}
          name="zaloEnabled"
        />
        <Label htmlFor={agentId ? `${agentId}-zaloEnabled` : 'new-zaloEnabled'}>
          {t('fields.channel_enabled')}
        </Label>
      </div>
    </div>
  );
}
