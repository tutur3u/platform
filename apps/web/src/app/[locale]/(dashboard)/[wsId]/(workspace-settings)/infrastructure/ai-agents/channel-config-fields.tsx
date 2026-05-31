'use client';

import { Bot, Cable, Eye, EyeOff, RotateCcw, Trash2 } from '@tuturuuu/icons';
import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SECRET_CLEAR_VALUE } from './ai-agents-utils';
import { ChannelStatus } from './channel-status';

type Channel = AiAgentDefinition['channels'][number];

function secretDescriptor(channel: Channel | undefined, name: string) {
  return channel?.secrets.find((secret) => secret.name === name);
}

function SensitiveSecretField({
  channel,
  label,
  name,
  secretName,
}: {
  channel?: Channel;
  label: string;
  name: string;
  secretName: string;
}) {
  const t = useTranslations('ai-agents-settings');
  const descriptor = secretDescriptor(channel, secretName);
  const [editing, setEditing] = useState(!descriptor?.configured);
  const [showValue, setShowValue] = useState(false);
  const [cleared, setCleared] = useState(false);

  if (cleared) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <input name={name} type="hidden" value={SECRET_CLEAR_VALUE} />
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {t('secret.cleared_on_save')}
          </span>
          <Button
            onClick={() => setCleared(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw className="h-4 w-4" />
            {t('actions.undo')}
          </Button>
        </div>
      </div>
    );
  }

  if (descriptor?.configured && !editing) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="font-mono"
            readOnly
            value={t('secret.configured', {
              suffix: descriptor.lastFour ?? '****',
            })}
          />
          <Button
            onClick={() => setEditing(true)}
            type="button"
            variant="outline"
          >
            {t('actions.replace')}
          </Button>
          <Button
            onClick={() => setCleared(true)}
            type="button"
            variant="secondary"
          >
            <Trash2 className="h-4 w-4" />
            {t('actions.clear')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex gap-2">
        <Input
          className="font-mono"
          id={name}
          name={name}
          placeholder={label}
          type={showValue ? 'text' : 'password'}
        />
        <Button
          aria-label={showValue ? t('actions.hide') : t('actions.show')}
          onClick={() => setShowValue((value) => !value)}
          size="icon"
          type="button"
          variant="outline"
        >
          {showValue ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
        {descriptor?.configured ? (
          <Button
            onClick={() => setEditing(false)}
            type="button"
            variant="ghost"
          >
            {t('actions.cancel')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

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
          defaultValue={channel?.externalChannelId ?? ''}
          name="zaloExternalChannelId"
          placeholder={t('fields.external_channel_id')}
        />
        <div className="md:col-span-2">
          <SensitiveSecretField
            channel={channel}
            label={t('fields.zalo_bot_token')}
            name="zaloBotToken"
            secretName="botToken"
          />
        </div>
        <div className="md:col-span-2">
          <SensitiveSecretField
            channel={channel}
            label={t('fields.zalo_webhook_secret')}
            name="zaloWebhookSecret"
            secretName="webhookSecret"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ToggleField
          defaultChecked={channel?.enabled ?? true}
          id={agentId ? `${agentId}-zaloEnabled` : 'new-zaloEnabled'}
          label={t('fields.channel_enabled')}
          name="zaloEnabled"
        />
        <ToggleField
          defaultChecked={channel?.autoRespond ?? true}
          id={agentId ? `${agentId}-zaloAutoRespond` : 'new-zaloAutoRespond'}
          label={t('fields.auto_respond')}
          name="zaloAutoRespond"
        />
        <ToggleField
          defaultChecked={channel?.historySyncEnabled ?? true}
          id={
            agentId
              ? `${agentId}-zaloHistorySyncEnabled`
              : 'new-zaloHistorySyncEnabled'
          }
          label={t('fields.history_sync')}
          name="zaloHistorySyncEnabled"
        />
      </div>
    </div>
  );
}

function ToggleField({
  defaultChecked,
  id,
  label,
  name,
}: {
  defaultChecked: boolean;
  id: string;
  label: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <Switch defaultChecked={defaultChecked} id={id} name={name} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
