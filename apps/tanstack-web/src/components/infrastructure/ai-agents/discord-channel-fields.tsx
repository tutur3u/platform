'use client';

import { Bot } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'use-intl';
import { SensitiveSecretField } from './channel-secret-field';
import { ChannelStatus } from './channel-status';
import { ToggleField } from './channel-toggle-field';
import type { Channel } from './channel-types';

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
          defaultValue={channel?.externalChannelId ?? ''}
          name="discordExternalChannelId"
          placeholder={t('fields.external_channel_id')}
        />
        <SensitiveSecretField
          channel={channel}
          label={t('fields.discord_application_id')}
          name="discordApplicationId"
          secretName="applicationId"
        />
        <SensitiveSecretField
          channel={channel}
          label={t('fields.discord_public_key')}
          name="discordPublicKey"
          secretName="publicKey"
        />
        <div className="md:col-span-2">
          <SensitiveSecretField
            channel={channel}
            label={t('fields.discord_bot_token')}
            name="discordBotToken"
            secretName="botToken"
          />
        </div>
      </div>
      <Textarea
        defaultValue={channel?.mentionRoleIds.join('\n') ?? ''}
        name="discordMentionRoleIds"
        placeholder={t('fields.discord_mentions')}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <ToggleField
          defaultChecked={channel?.enabled ?? true}
          id={agentId ? `${agentId}-discordEnabled` : 'new-discordEnabled'}
          label={t('fields.channel_enabled')}
          name="discordEnabled"
        />
        <ToggleField
          defaultChecked={channel?.autoRespond ?? true}
          id={
            agentId ? `${agentId}-discordAutoRespond` : 'new-discordAutoRespond'
          }
          label={t('fields.auto_respond')}
          name="discordAutoRespond"
        />
        <ToggleField
          defaultChecked={channel?.historySyncEnabled ?? true}
          id={
            agentId
              ? `${agentId}-discordHistorySyncEnabled`
              : 'new-discordHistorySyncEnabled'
          }
          label={t('fields.history_sync')}
          name="discordHistorySyncEnabled"
        />
      </div>
    </div>
  );
}
