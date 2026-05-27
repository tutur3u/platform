import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  AI_AGENT_ADAPTERS,
  AI_AGENT_ALLOWED_TOOLS,
  AI_AGENT_IDENTITY_PREFIX,
  AI_AGENT_REGISTRY_PREFIX,
  type AiAgentAdapter,
  type AiAgentAllowedTool,
  type AiAgentChannelConfig,
  type AiAgentChannelStatus,
  type AiAgentDefinition,
  type AiAgentIdentityLink,
} from './types';

export const FIELD_VALUE_LIMIT = 3900;
export const DEFAULT_MODEL_ID = 'google/gemini-3.1-flash-lite';
export const DEFAULT_INSTRUCTIONS =
  'You are a Tuturuuu agent operating inside Discord or Zalo. Keep replies concise, respect workspace permissions, and use tools only when they help the mapped Tuturuuu user.';

export type SecretRow = {
  name: string;
  value: string | null;
};

export type AgentMetaRecord = {
  createdAt?: string | null;
  enabled?: boolean;
  id?: string;
  modelId?: string;
  name?: string;
  temperature?: number | null;
  tools?: AiAgentAllowedTool[];
  updatedAt?: string | null;
};

export type ChannelMetaRecord = {
  adapter?: AiAgentAdapter;
  displayName?: string;
  enabled?: boolean;
  id?: string;
  lastDeployedAt?: string | null;
  lastError?: string | null;
  lastEventAt?: string | null;
  mentionRoleIds?: string[];
  status?: AiAgentChannelStatus;
  webhookUrl?: string | null;
  workspaceId?: string;
  discordGuildId?: string | null;
  zaloOfficialAccountId?: string | null;
};

type ParsedAgentRow =
  | { agentId: string; field: 'meta' }
  | { agentId: string; field: 'instructions'; index: number | null }
  | { agentId: string; channelId: string; field: 'channelMeta' }
  | {
      agentId: string;
      channelId: string;
      field: 'channelSecret';
      secret: string;
    };

export function assertId(value: string, label: string) {
  const id = value.trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,80}$/u.test(id)) {
    throw new Error(`invalid_${label}`);
  }

  return id;
}

export function assertSecretName(value: string) {
  const secretName = value.trim();

  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(secretName)) {
    throw new Error('invalid_secret_name');
  }

  return secretName;
}

export function safeJsonParse<T>(
  value: string | null | undefined,
  fallback: T
) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyField(value: unknown) {
  const serialized = JSON.stringify(value);

  if (serialized.length > FIELD_VALUE_LIMIT) {
    throw new Error('field_value_too_large');
  }

  return serialized;
}

export function splitLongValue(value: string) {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += FIELD_VALUE_LIMIT) {
    chunks.push(value.slice(index, index + FIELD_VALUE_LIMIT));
  }

  return chunks.length ? chunks : [''];
}

export function agentKey(agentId: string, field: 'instructions' | 'meta') {
  return `${AI_AGENT_REGISTRY_PREFIX}:${agentId}:${field}`;
}

export function instructionChunkKey(agentId: string, index: number) {
  return `${AI_AGENT_REGISTRY_PREFIX}:${agentId}:instructions:${index}`;
}

export function channelMetaKey(agentId: string, channelId: string) {
  return `${AI_AGENT_REGISTRY_PREFIX}:${agentId}:channel:${channelId}:meta`;
}

export function channelSecretKey(
  agentId: string,
  channelId: string,
  secretName: string
) {
  return `${AI_AGENT_REGISTRY_PREFIX}:${agentId}:channel:${channelId}:secret:${secretName}`;
}

export function identityKey(link: AiAgentIdentityLink) {
  return `${AI_AGENT_IDENTITY_PREFIX}:${link.workspaceId}:zalo:${link.providerAccountId}:${link.externalUserId}`;
}

export function parseAgentRowName(name: string): ParsedAgentRow | null {
  const parts = name.split(':');

  if (parts[0] !== AI_AGENT_REGISTRY_PREFIX || !parts[1]) {
    return null;
  }

  const agentId = parts[1];

  if (parts[2] === 'meta') {
    return { agentId, field: 'meta' };
  }

  if (parts[2] === 'instructions') {
    const maybeIndex = parts[3];
    return {
      agentId,
      field: 'instructions',
      index: maybeIndex ? Number.parseInt(maybeIndex, 10) : null,
    };
  }

  if (parts[2] === 'channel' && parts[3] && parts[4] === 'meta') {
    return { agentId, channelId: parts[3], field: 'channelMeta' };
  }

  if (parts[2] === 'channel' && parts[3] && parts[4] === 'secret' && parts[5]) {
    return {
      agentId,
      channelId: parts[3],
      field: 'channelSecret',
      secret: parts.slice(5).join(':'),
    };
  }

  return null;
}

export function getRequiredSecrets(adapter: AiAgentAdapter) {
  if (adapter === 'discord') {
    return ['applicationId', 'botToken', 'publicKey'];
  }

  return ['botToken', 'webhookSecret'];
}

export function normalizeTools(tools?: AiAgentAllowedTool[]) {
  const selected = (tools?.length ? tools : AI_AGENT_ALLOWED_TOOLS).filter(
    (tool): tool is AiAgentAllowedTool =>
      AI_AGENT_ALLOWED_TOOLS.includes(tool as AiAgentAllowedTool)
  );

  return [...new Set(selected)];
}

export function normalizeAdapter(value: string): AiAgentAdapter {
  if (AI_AGENT_ADAPTERS.includes(value as AiAgentAdapter)) {
    return value as AiAgentAdapter;
  }

  throw new Error('invalid_adapter');
}

export function secretDescriptor(
  name: string,
  value: string | null | undefined
) {
  const configured = Boolean(value);
  return {
    configured,
    lastFour: value ? value.slice(-4) : null,
    name,
  };
}

export function buildWebhookUrl({
  adapter,
  channelId,
  origin,
}: {
  adapter: AiAgentAdapter;
  channelId: string;
  origin?: string | null;
}) {
  const base = origin?.replace(/\/$/u, '') || '';
  return `${base}/api/v1/webhooks/ai-agents/${adapter}/${channelId}`;
}

export function buildAgentDefinitions(
  rows: SecretRow[],
  origin?: string | null
) {
  const agents = new Map<
    string,
    {
      channelMeta: Map<string, ChannelMetaRecord>;
      channelSecrets: Map<string, Map<string, string | null>>;
      instructions: Map<number, string>;
      meta: AgentMetaRecord;
      unsplitInstructions: string | null;
    }
  >();

  for (const row of rows) {
    const parsed = parseAgentRowName(row.name);

    if (!parsed) {
      continue;
    }

    const entry =
      agents.get(parsed.agentId) ??
      ({
        channelMeta: new Map(),
        channelSecrets: new Map(),
        instructions: new Map(),
        meta: {},
        unsplitInstructions: null,
      } satisfies {
        channelMeta: Map<string, ChannelMetaRecord>;
        channelSecrets: Map<string, Map<string, string | null>>;
        instructions: Map<number, string>;
        meta: AgentMetaRecord;
        unsplitInstructions: string | null;
      });

    if (parsed.field === 'meta') {
      entry.meta = safeJsonParse<AgentMetaRecord>(row.value, {});
    } else if (parsed.field === 'instructions') {
      if (parsed.index === null || Number.isNaN(parsed.index)) {
        entry.unsplitInstructions = row.value ?? '';
      } else {
        entry.instructions.set(parsed.index, row.value ?? '');
      }
    } else if (parsed.field === 'channelMeta') {
      entry.channelMeta.set(
        parsed.channelId,
        safeJsonParse<ChannelMetaRecord>(row.value, {})
      );
    } else if (parsed.field === 'channelSecret') {
      const secrets = entry.channelSecrets.get(parsed.channelId) ?? new Map();
      secrets.set(parsed.secret, row.value);
      entry.channelSecrets.set(parsed.channelId, secrets);
    }

    agents.set(parsed.agentId, entry);
  }

  return [...agents.entries()]
    .map(([agentId, entry]): AiAgentDefinition => {
      const meta = entry.meta;
      const instructions =
        entry.instructions.size > 0
          ? [...entry.instructions.entries()]
              .sort(([a], [b]) => a - b)
              .map(([, value]) => value)
              .join('')
          : entry.unsplitInstructions || DEFAULT_INSTRUCTIONS;

      const channels = [...entry.channelMeta.entries()]
        .map(([channelId, channelMeta]): AiAgentChannelConfig => {
          const adapter = normalizeAdapter(channelMeta.adapter ?? 'discord');
          const secrets = entry.channelSecrets.get(channelId) ?? new Map();
          const secretNames = new Set([
            ...getRequiredSecrets(adapter),
            ...secrets.keys(),
          ]);

          return {
            adapter,
            displayName: channelMeta.displayName || adapter,
            enabled: channelMeta.enabled ?? true,
            id: channelId,
            lastDeployedAt: channelMeta.lastDeployedAt ?? null,
            lastError: channelMeta.lastError ?? null,
            lastEventAt: channelMeta.lastEventAt ?? null,
            mentionRoleIds: channelMeta.mentionRoleIds ?? [],
            secrets: [...secretNames]
              .sort()
              .map((name) => secretDescriptor(name, secrets.get(name))),
            status: channelMeta.status ?? 'draft',
            webhookUrl:
              channelMeta.webhookUrl ||
              buildWebhookUrl({ adapter, channelId, origin }),
            workspaceId: channelMeta.workspaceId || ROOT_WORKSPACE_ID,
            discordGuildId: channelMeta.discordGuildId ?? null,
            zaloOfficialAccountId: channelMeta.zaloOfficialAccountId ?? null,
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      return {
        channels,
        createdAt: meta.createdAt ?? null,
        enabled: meta.enabled ?? true,
        id: agentId,
        instructions,
        modelId: meta.modelId || DEFAULT_MODEL_ID,
        name: meta.name || agentId,
        temperature: meta.temperature ?? null,
        tools: normalizeTools(meta.tools),
        updatedAt: meta.updatedAt ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
