'use client';

import { Check, Pause, X } from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure/ai';
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
    <section className="min-w-0 space-y-3 overflow-hidden rounded-md border bg-muted/10 p-3">
      <h3 className="flex min-w-0 items-center gap-2 font-medium text-sm">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 truncate">{title}</span>
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
      <span className="shrink-0 text-muted-foreground">{label}</span>
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
      : isPersonalZaloChannel(channel)
        ? ['personalCookieJson', 'personalImei', 'personalUserAgent']
        : ['botToken', 'webhookSecret'];
  return [
    ...new Set([...required, ...channel.secrets.map((item) => item.name)]),
  ];
}

export function isPersonalZaloChannel(channel: AiAgentChannelConfig) {
  return channel.adapter === 'zalo' && channel.zaloAccountMode === 'personal';
}

const ZALO_PERSONAL_ERROR_KEYS = {
  ai_agent_zalo_personal_channel_required:
    'agent_zalo_personal_channel_required',
  zalo_personal_cookie_json_invalid: 'agent_zalo_personal_cookie_json_invalid',
  zalo_personal_credentials_missing: 'agent_zalo_personal_credentials_missing',
  zalo_personal_feature_disabled: 'agent_zalo_personal_feature_disabled',
  zalo_personal_phone_sync_timed_out: 'agent_zalo_personal_sync_phone_failed',
  zalo_personal_phone_sync_no_payload:
    'agent_zalo_personal_sync_phone_no_payload',
  zalo_personal_phone_sync_waiting_for_phone:
    'agent_zalo_personal_sync_phone_waiting',
  zalo_personal_web_sync_browser_unavailable:
    'agent_zalo_personal_sync_web_browser_unavailable',
  zalo_personal_web_sync_failed: 'agent_zalo_personal_sync_web_failed',
  zalo_personal_web_sync_login_required:
    'agent_zalo_personal_sync_web_login_required',
  zalo_personal_web_sync_timed_out: 'agent_zalo_personal_sync_web_timed_out',
  zalo_personal_web_sync_waiting_for_phone:
    'agent_zalo_personal_sync_phone_waiting',
  zalo_personal_qr_aborted: 'agent_zalo_personal_qr_aborted',
  zalo_personal_qr_credentials_missing:
    'agent_zalo_personal_qr_credentials_missing',
  zalo_personal_qr_declined: 'agent_zalo_personal_qr_declined',
  zalo_personal_qr_expired: 'agent_zalo_personal_qr_expired',
} as const;

export function formatZaloPersonalError(
  error: string | null | undefined,
  t: ReturnType<typeof useTranslations>
) {
  if (!error) return null;

  const key =
    ZALO_PERSONAL_ERROR_KEYS[error as keyof typeof ZALO_PERSONAL_ERROR_KEYS];
  if (key) return t(key);

  if (error.startsWith('zalo_personal_qr_')) {
    return t('agent_zalo_personal_qr_failed');
  }

  return error;
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

  if (channel.adapter === 'discord') {
    return {
      ...base,
      discordGuildId:
        String(formData.get('discordGuildId') ?? '').trim() || null,
    };
  }

  const zaloAccountMode = channel.zaloAccountMode ?? 'official';

  return {
    ...base,
    zaloAccountMode,
    zaloOfficialAccountId:
      zaloAccountMode === 'official'
        ? String(formData.get('zaloOfficialAccountId') ?? '').trim() || null
        : null,
    zaloPersonalOwnId:
      zaloAccountMode === 'personal'
        ? String(formData.get('zaloPersonalOwnId') ?? '').trim() ||
          channel.zaloPersonalOwnId ||
          null
        : null,
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

  if (channel.adapter === 'discord') {
    return {
      ...base,
      discordGuildId: channel.discordGuildId ?? null,
    };
  }

  const zaloAccountMode = channel.zaloAccountMode ?? 'official';

  return {
    ...base,
    zaloAccountMode,
    zaloOfficialAccountId:
      zaloAccountMode === 'official'
        ? (channel.zaloOfficialAccountId ?? null)
        : null,
    zaloPersonalOwnId:
      zaloAccountMode === 'personal'
        ? (channel.zaloPersonalOwnId ?? null)
        : null,
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
