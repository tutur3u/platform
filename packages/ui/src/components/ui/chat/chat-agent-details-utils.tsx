'use client';

import { Check, Pause, X } from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '../badge';
import { Label } from '../label';
import { toast } from '../sonner';

export type AgentConversationMetadata = {
  agentId: string;
  channelId: string;
  source: 'ai-agent' | 'ai-agent-external-thread';
  adapter?: string;
  externalChannelId?: string;
  externalThreadId?: string;
  externalThreadUuid?: string;
  messageCount?: number;
};

export function readAgentConversationMetadata(
  conversation?: ChatConversation | null
): AgentConversationMetadata | null {
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

  return {
    agentId,
    adapter:
      typeof conversation.metadata.adapter === 'string'
        ? conversation.metadata.adapter
        : undefined,
    channelId,
    externalChannelId:
      typeof conversation.metadata.externalChannelId === 'string'
        ? conversation.metadata.externalChannelId
        : undefined,
    externalThreadId:
      typeof conversation.metadata.externalThreadId === 'string'
        ? conversation.metadata.externalThreadId
        : undefined,
    externalThreadUuid:
      typeof conversation.metadata.externalThreadUuid === 'string'
        ? conversation.metadata.externalThreadUuid
        : undefined,
    messageCount:
      typeof conversation.metadata.messageCount === 'number'
        ? conversation.metadata.messageCount
        : undefined,
    source: conversation.metadata.source,
  };
}

export function PanelSection({
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

export function Field({
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

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

export function ChannelStatusBadge({
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

export function buildAgentPayload(
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

export function secretNamesForChannel(channel: AiAgentChannelConfig) {
  const required =
    channel.adapter === 'discord'
      ? ['applicationId', 'publicKey', 'botToken']
      : ['botToken', 'webhookSecret'];
  return [
    ...new Set([...required, ...channel.secrets.map((item) => item.name)]),
  ];
}

export async function copyToClipboard(
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

function buildSelectedChannelPayload(
  formData: FormData,
  channel: AiAgentChannelConfig
): NonNullable<SaveAiAgentPayload['channels']>[number] {
  const base = {
    adapter: channel.adapter,
    autoRespond: formData.get('channelAutoRespond') === 'on',
    displayName:
      String(formData.get('channelDisplayName') ?? '').trim() ||
      channel.displayName,
    enabled: formData.get('channelEnabled') === 'on',
    externalChannelId:
      String(formData.get('externalChannelId') ?? '').trim() || null,
    historySyncEnabled: formData.get('channelHistorySyncEnabled') === 'on',
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
    autoRespond: channel.autoRespond ?? true,
    displayName: channel.displayName,
    enabled: channel.enabled,
    externalChannelId: channel.externalChannelId ?? null,
    historySyncEnabled: channel.historySyncEnabled ?? true,
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

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
