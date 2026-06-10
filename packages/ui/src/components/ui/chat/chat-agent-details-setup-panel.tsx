'use client';

import {
  Bot,
  Cable,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Save,
  Settings2,
} from '@tuturuuu/icons';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Label } from '../label';
import { Switch } from '../switch';
import { Textarea } from '../textarea';
import {
  buildAgentPayload,
  Field,
  isPersonalZaloChannel,
  PanelSection,
  secretNamesForChannel,
} from './chat-agent-details-utils';

export function AgentSetupForm({
  agent,
  channel,
  isPending,
  onSubmit,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  isPending: boolean;
  onSubmit: (payload: SaveAiAgentPayload) => void;
}) {
  const t = useTranslations('chat');

  return (
    <form
      className="space-y-4"
      key={`${agent.id}-${channel.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(
          buildAgentPayload(new FormData(event.currentTarget), agent, channel)
        );
      }}
    >
      <PanelSection
        icon={<Settings2 className="size-4" />}
        title={t('agent_setup')}
      >
        <div className="grid gap-3">
          <Field id="agent-name" label={t('agent_name')}>
            <Input
              defaultValue={agent.name}
              id="agent-name"
              name="name"
              required
            />
          </Field>
          <Field id="agent-model" label={t('agent_model')}>
            <Input
              defaultValue={agent.modelId}
              id="agent-model"
              name="modelId"
              required
            />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <Label htmlFor="agent-enabled">{t('agent_enabled')}</Label>
            <Switch
              defaultChecked={agent.enabled}
              id="agent-enabled"
              name="agentEnabled"
            />
          </div>
          <Field id="agent-instructions" label={t('agent_instructions')}>
            <Textarea
              defaultValue={agent.instructions}
              id="agent-instructions"
              name="instructions"
              rows={7}
            />
          </Field>
        </div>
      </PanelSection>

      <PanelSection
        icon={
          channel.adapter === 'discord' ? (
            <Bot className="size-4" />
          ) : (
            <Cable className="size-4" />
          )
        }
        title={t('agent_channel_setup')}
      >
        <div className="grid gap-3">
          <Field
            id="agent-channel-display-name"
            label={t('agent_display_name')}
          >
            <Input
              defaultValue={channel.displayName}
              id="agent-channel-display-name"
              name="channelDisplayName"
              required
            />
          </Field>
          <Field id="agent-channel-workspace" label={t('agent_workspace_id')}>
            <Input
              className="font-mono"
              defaultValue={channel.workspaceId}
              id="agent-channel-workspace"
              name="workspaceId"
              required
            />
          </Field>
          <Field
            id="agent-external-channel"
            label={t('agent_external_channel_id')}
          >
            <Input
              className="font-mono"
              defaultValue={channel.externalChannelId ?? ''}
              id="agent-external-channel"
              name="externalChannelId"
            />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <Label htmlFor="agent-channel-enabled">
              {t('agent_channel_enabled')}
            </Label>
            <Switch
              defaultChecked={channel.enabled}
              id="agent-channel-enabled"
              name="channelEnabled"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <Label htmlFor="agent-channel-auto-respond">
              {t('agent_auto_respond')}
            </Label>
            <Switch
              defaultChecked={channel.autoRespond ?? true}
              id="agent-channel-auto-respond"
              name="channelAutoRespond"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <Label htmlFor="agent-channel-history-sync">
              {t('agent_history_sync')}
            </Label>
            <Switch
              defaultChecked={channel.historySyncEnabled ?? true}
              id="agent-channel-history-sync"
              name="channelHistorySyncEnabled"
            />
          </div>
          {channel.adapter === 'discord' ? (
            <>
              <Field
                id="agent-discord-guild"
                label={t('agent_discord_guild_id')}
              >
                <Input
                  className="font-mono"
                  defaultValue={channel.discordGuildId ?? ''}
                  id="agent-discord-guild"
                  name="discordGuildId"
                />
              </Field>
              <Field
                id="agent-discord-mentions"
                label={t('agent_discord_mentions')}
              >
                <Textarea
                  defaultValue={channel.mentionRoleIds.join('\n')}
                  id="agent-discord-mentions"
                  name="mentionRoleIds"
                  rows={3}
                />
              </Field>
            </>
          ) : isPersonalZaloChannel(channel) ? (
            <Field
              id="agent-zalo-personal-own-id"
              label={t('agent_zalo_personal_own_id')}
            >
              <Input
                className="font-mono"
                defaultValue={channel.zaloPersonalOwnId ?? ''}
                id="agent-zalo-personal-own-id"
                name="zaloPersonalOwnId"
                readOnly
              />
            </Field>
          ) : (
            <Field id="agent-zalo-oa" label={t('agent_zalo_oa_id')}>
              <Input
                className="font-mono"
                defaultValue={channel.zaloOfficialAccountId ?? ''}
                id="agent-zalo-oa"
                name="zaloOfficialAccountId"
              />
            </Field>
          )}
        </div>
      </PanelSection>

      <PanelSection
        icon={<KeyRound className="size-4" />}
        title={t('agent_secrets')}
      >
        <div className="grid gap-3">
          {secretNamesForChannel(channel).map((secretName) => (
            <SecretInput
              descriptor={channel.secrets.find(
                (item) => item.name === secretName
              )}
              key={secretName}
              name={`secret:${secretName}`}
              secretName={secretName}
            />
          ))}
        </div>
      </PanelSection>

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        {t('agent_save')}
      </Button>
    </form>
  );
}

function SecretInput({
  descriptor,
  name,
  secretName,
}: {
  descriptor?: AiAgentChannelConfig['secrets'][number];
  name: string;
  secretName: string;
}) {
  const t = useTranslations('chat');
  const [show, setShow] = useState(false);
  const [clear, setClear] = useState(false);

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="min-w-0 truncate" htmlFor={name}>
          {secretName}
        </Label>
        <Badge variant={descriptor?.configured ? 'success' : 'secondary'}>
          {descriptor?.configured
            ? t('agent_secret_configured', {
                suffix: descriptor.lastFour ?? '****',
              })
            : t('agent_secret_missing')}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Input
          className="font-mono"
          disabled={clear}
          id={name}
          name={name}
          placeholder={t('agent_secret_placeholder')}
          type={show ? 'text' : 'password'}
        />
        <Button
          aria-label={show ? t('hide') : t('show')}
          className="size-9"
          onClick={() => setShow((value) => !value)}
          size="icon"
          type="button"
          variant="outline"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {descriptor?.configured ? (
        <label className="flex items-center gap-2 text-muted-foreground text-xs">
          <Checkbox
            checked={clear}
            name={`${name}:clear`}
            onCheckedChange={(value) => setClear(value === true)}
          />
          {t('agent_clear_secret_on_save')}
        </label>
      ) : null}
    </div>
  );
}
