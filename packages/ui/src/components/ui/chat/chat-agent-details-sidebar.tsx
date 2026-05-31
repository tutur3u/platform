'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Cable,
  Check,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
  Save,
  Settings2,
  Webhook,
  X,
} from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure';
import {
  deployAiAgentChannel,
  listAiAgents,
  pauseAiAgentChannel,
  rotateAiAgentChannelSecret,
  saveAiAgent,
  testAiAgentChannel,
} from '@tuturuuu/internal-api/infrastructure';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Label } from '../label';
import { ScrollArea } from '../scroll-area';
import { toast } from '../sonner';
import { Switch } from '../switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import { Textarea } from '../textarea';

type AgentTab = 'operations' | 'setup';

const AGENT_QUERY_KEY = ['chat', 'infrastructure-ai-agents'] as const;

export function ChatAgentDetailsSidebar({
  conversation,
  open,
}: {
  conversation?: ChatConversation | null;
  open: boolean;
}) {
  const t = useTranslations('chat');
  const queryClient = useQueryClient();
  const metadata = readAgentConversationMetadata(conversation);
  const [secretPreview, setSecretPreview] = useState<{
    label: string;
    value: string;
  } | null>(null);
  const agentsQuery = useQuery({
    enabled: open && Boolean(metadata),
    queryFn: () => listAiAgents(),
    queryKey: AGENT_QUERY_KEY,
    staleTime: 30_000,
  });
  const agent = useMemo(
    () =>
      metadata
        ? agentsQuery.data?.agents.find((item) => item.id === metadata.agentId)
        : undefined,
    [agentsQuery.data?.agents, metadata]
  );
  const channel = useMemo(
    () =>
      metadata && agent
        ? agent.channels.find((item) => item.id === metadata.channelId)
        : undefined,
    [agent, metadata]
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEY });
  const saveMutation = useMutation({
    mutationFn: (payload: SaveAiAgentPayload) => saveAiAgent(payload),
    onError: (error) => toast.error(error.message || t('agent_save_failed')),
    onSuccess: () => {
      toast.success(t('agent_save_success'));
      void refresh();
    },
  });
  const deployMutation = useMutation({
    mutationFn: () =>
      agent && channel
        ? deployAiAgentChannel(agent.id, channel.id)
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_deploy_failed')),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t('agent_deploy_success'));
      } else {
        toast.error(result.missing.join(', ') || t('agent_deploy_failed'));
      }
      void refresh();
    },
  });
  const pauseMutation = useMutation({
    mutationFn: () =>
      agent && channel
        ? pauseAiAgentChannel(agent.id, channel.id)
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_pause_failed')),
    onSuccess: () => {
      toast.success(t('agent_pause_success'));
      void refresh();
    },
  });
  const testMutation = useMutation({
    mutationFn: (prompt?: string) =>
      agent && channel
        ? testAiAgentChannel(agent.id, channel.id, prompt)
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_test_failed')),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.response || t('agent_test_success'));
      else toast.error(result.response || t('agent_test_failed'));
    },
  });
  const rotateMutation = useMutation({
    mutationFn: () =>
      agent && channel
        ? rotateAiAgentChannelSecret(agent.id, channel.id, 'webhookSecret')
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_rotate_failed')),
    onSuccess: (result) => {
      setSecretPreview({
        label: result.secret.name,
        value: result.secret.value,
      });
      toast.success(t('agent_secret_rotated'));
      void refresh();
    },
  });
  const isPending =
    saveMutation.isPending ||
    deployMutation.isPending ||
    pauseMutation.isPending ||
    testMutation.isPending ||
    rotateMutation.isPending;

  if (!open) return null;

  return (
    <aside className="hidden w-96 min-w-0 shrink-0 overflow-hidden border-l bg-background md:flex md:flex-col">
      <Tabs
        className="min-h-0 flex-1 gap-0"
        defaultValue="setup"
        orientation="vertical"
      >
        <div className="border-b p-3">
          <h2 className="flex min-w-0 items-center gap-2 font-semibold text-sm">
            <Bot className="size-4 shrink-0" />
            <span className="truncate">{t('agent_details')}</span>
          </h2>
          {agent && channel ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <Badge variant={agent.enabled ? 'success' : 'secondary'}>
                {agent.enabled ? t('agent_enabled') : t('agent_disabled')}
              </Badge>
              <ChannelStatusBadge status={channel.status} />
              <span className="min-w-0 truncate text-muted-foreground">
                {agent.id} / {channel.id}
              </span>
            </div>
          ) : null}
          <TabsList className="mt-3 grid h-9 w-full grid-cols-2 rounded-md">
            <TabsTrigger className="text-xs" value="setup" asChild>
              <button type="button">{t('agent_setup')}</button>
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="operations" asChild>
              <button type="button">{t('agent_operations')}</button>
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {agentsQuery.isLoading ? (
            <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              {t('loading_ai_settings')}
            </div>
          ) : !agent || !channel ? (
            <div className="p-4 text-muted-foreground text-sm">
              {t('agent_not_found')}
            </div>
          ) : (
            <>
              <TabsContent
                className="m-0 p-3"
                value={'setup' satisfies AgentTab}
              >
                <AgentSetupForm
                  agent={agent}
                  channel={channel}
                  isPending={isPending}
                  onSubmit={(payload) => saveMutation.mutate(payload)}
                />
              </TabsContent>
              <TabsContent
                className="m-0 p-3"
                value={'operations' satisfies AgentTab}
              >
                <AgentOperationsPanel
                  channel={channel}
                  isPending={isPending}
                  onCopySecret={() => setSecretPreview(null)}
                  onDeploy={() => deployMutation.mutate()}
                  onPause={() => pauseMutation.mutate()}
                  onRotateSecret={() => rotateMutation.mutate()}
                  onTest={(prompt) => testMutation.mutate(prompt)}
                  secretPreview={secretPreview}
                />
              </TabsContent>
            </>
          )}
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

function AgentSetupForm({
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

function AgentOperationsPanel({
  channel,
  isPending,
  onCopySecret,
  onDeploy,
  onPause,
  onRotateSecret,
  onTest,
  secretPreview,
}: {
  channel: AiAgentChannelConfig;
  isPending: boolean;
  onCopySecret: () => void;
  onDeploy: () => void;
  onPause: () => void;
  onRotateSecret: () => void;
  onTest: (prompt?: string) => void;
  secretPreview: { label: string; value: string } | null;
}) {
  const t = useTranslations('chat');
  const [testPrompt, setTestPrompt] = useState('');
  const webhookUrl = channel.webhookUrl;

  return (
    <div className="space-y-4">
      <PanelSection
        icon={<Webhook className="size-4" />}
        title={t('agent_channel')}
      >
        <div className="space-y-2">
          <KeyValue label={t('agent_channel_id')} value={channel.id} />
          <KeyValue label={t('agent_adapter')} value={channel.adapter} />
          <KeyValue
            label={t('agent_last_event')}
            value={channel.lastEventAt ?? t('never')}
          />
          {webhookUrl ? (
            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 p-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                {webhookUrl}
              </code>
              <Button
                aria-label={t('agent_copy_webhook')}
                className="size-7"
                onClick={() =>
                  copyToClipboard(webhookUrl, {
                    error: t('message_copy_failed'),
                    success: t('agent_copied_webhook'),
                  })
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          ) : null}
          {channel.lastError ? (
            <p className="rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
              {channel.lastError}
            </p>
          ) : null}
        </div>
      </PanelSection>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={isPending} onClick={onDeploy} size="sm" type="button">
          <Play className="size-4" />
          {t('agent_deploy')}
        </Button>
        <Button
          disabled={isPending}
          onClick={onPause}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Pause className="size-4" />
          {t('agent_pause')}
        </Button>
      </div>

      <PanelSection
        icon={<FlaskConical className="size-4" />}
        title={t('agent_test')}
      >
        <div className="space-y-2">
          <Input
            onChange={(event) => setTestPrompt(event.target.value)}
            placeholder={t('agent_test_prompt')}
            value={testPrompt}
          />
          <Button
            className="w-full"
            disabled={isPending}
            onClick={() => onTest(testPrompt.trim() || undefined)}
            type="button"
            variant="outline"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            {t('agent_test')}
          </Button>
        </div>
      </PanelSection>

      {channel.adapter === 'zalo' ? (
        <PanelSection
          icon={<RotateCw className="size-4" />}
          title={t('agent_rotate_secret')}
        >
          <div className="space-y-2">
            <Button
              className="w-full"
              disabled={isPending}
              onClick={onRotateSecret}
              type="button"
              variant="outline"
            >
              <RotateCw className="size-4" />
              {t('agent_rotate_secret')}
            </Button>
            {secretPreview ? (
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="mb-1 font-medium">
                  {t('agent_secret_value')}: {secretPreview.label}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono">
                    {secretPreview.value}
                  </code>
                  <Button
                    aria-label={t('copy_as_text')}
                    className="size-7"
                    onClick={async () => {
                      await copyToClipboard(secretPreview.value, {
                        error: t('message_copy_failed'),
                        success: t('message_copied'),
                      });
                      onCopySecret();
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </PanelSection>
      ) : null}
    </div>
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

function PanelSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3 rounded-md border bg-muted/10 p-3">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function ChannelStatusBadge({
  status,
}: {
  status: AiAgentChannelConfig['status'];
}) {
  const t = useTranslations('chat');
  const isHealthy = status === 'deployed';
  const isPaused = status === 'paused' || status === 'draft';

  return (
    <Badge
      className={cn(
        !isHealthy && !isPaused && 'border-dynamic-red/30 text-dynamic-red'
      )}
      variant={isHealthy ? 'success' : 'secondary'}
    >
      {isHealthy ? (
        <Check className="mr-1 size-3" />
      ) : isPaused ? (
        <Pause className="mr-1 size-3" />
      ) : (
        <X className="mr-1 size-3" />
      )}
      {t(`agent_status_${status}`)}
    </Badge>
  );
}

function buildAgentPayload(
  formData: FormData,
  agent: AiAgentDefinition,
  selectedChannel: AiAgentChannelConfig
): SaveAiAgentPayload {
  const channelInputs = agent.channels.map((channel) =>
    channel.id === selectedChannel.id
      ? buildSelectedChannelPayload(formData, channel)
      : buildExistingChannelPayload(channel)
  );

  return {
    channels: channelInputs,
    enabled: formData.get('agentEnabled') === 'on',
    id: agent.id,
    instructions: String(formData.get('instructions') ?? '').trim(),
    modelId: String(formData.get('modelId') ?? '').trim() || agent.modelId,
    name: String(formData.get('name') ?? '').trim() || agent.name,
    temperature: agent.temperature,
    tools: agent.tools,
  };
}

function buildSelectedChannelPayload(
  formData: FormData,
  channel: AiAgentChannelConfig
): NonNullable<SaveAiAgentPayload['channels']>[number] {
  const base = {
    adapter: channel.adapter,
    displayName:
      String(formData.get('channelDisplayName') ?? '').trim() ||
      channel.displayName,
    enabled: formData.get('channelEnabled') === 'on',
    id: channel.id,
    mentionRoleIds:
      channel.adapter === 'discord'
        ? splitLines(formData.get('mentionRoleIds'))
        : channel.mentionRoleIds,
    secrets: readSecretPayload(formData),
    status: channel.status,
    workspaceId:
      String(formData.get('workspaceId') ?? '').trim() || channel.workspaceId,
  };

  return channel.adapter === 'discord'
    ? {
        ...base,
        discordGuildId:
          String(formData.get('discordGuildId') ?? '').trim() || null,
      }
    : {
        ...base,
        zaloOfficialAccountId:
          String(formData.get('zaloOfficialAccountId') ?? '').trim() || null,
      };
}

function buildExistingChannelPayload(
  channel: AiAgentChannelConfig
): NonNullable<SaveAiAgentPayload['channels']>[number] {
  const base = {
    adapter: channel.adapter,
    displayName: channel.displayName,
    enabled: channel.enabled,
    id: channel.id,
    mentionRoleIds: channel.mentionRoleIds,
    status: channel.status,
    workspaceId: channel.workspaceId,
  };

  return channel.adapter === 'discord'
    ? {
        ...base,
        discordGuildId: channel.discordGuildId ?? null,
      }
    : {
        ...base,
        zaloOfficialAccountId: channel.zaloOfficialAccountId ?? null,
      };
}

function readSecretPayload(formData: FormData) {
  const secrets: Record<string, string | null | undefined> = {};

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('secret:')) continue;
    const secretName = key.slice('secret:'.length).replace(/:clear$/u, '');
    if (!secretName) continue;

    if (key.endsWith(':clear')) {
      secrets[secretName] = value === 'on' ? null : secrets[secretName];
      continue;
    }

    const stringValue = String(value).trim();
    if (stringValue) secrets[secretName] = stringValue;
  }

  return secrets;
}

function secretNamesForChannel(channel: AiAgentChannelConfig) {
  const required =
    channel.adapter === 'discord'
      ? ['applicationId', 'publicKey', 'botToken']
      : ['botToken', 'webhookSecret'];
  return [
    ...new Set([...required, ...channel.secrets.map((item) => item.name)]),
  ];
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readAgentConversationMetadata(conversation?: ChatConversation | null) {
  if (
    conversation?.metadata?.source !== 'ai-agent' &&
    conversation?.metadata?.source !== 'ai-agent-external-thread'
  ) {
    return null;
  }
  const agentId = conversation.metadata.agentId;
  const channelId = conversation.metadata.channelId;
  if (typeof agentId !== 'string' || typeof channelId !== 'string') {
    return null;
  }
  return { agentId, channelId };
}

async function copyToClipboard(
  value: string,
  labels: { error: string; success: string }
) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(labels.success);
  } catch {
    toast.error(labels.error);
  }
}
