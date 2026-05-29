export const CHAT_AI_SETTINGS_FULL_SELECT =
  'conversation_id, model_id, system_prompt, auto_reply, enabled, thinking_mode, credit_source, credit_ws_id, updated_at';

export const CHAT_AI_SETTINGS_LEGACY_SELECT =
  'conversation_id, model_id, system_prompt, auto_reply, enabled, updated_at';

export const NATIVE_CHAT_AI_SETTINGS_FULL_SELECT =
  'model_id, system_prompt, thinking_mode, credit_source, credit_ws_id';

export const NATIVE_CHAT_AI_SETTINGS_LEGACY_SELECT = 'model_id, system_prompt';

export type ChatAiSettingsPatch = {
  creditSource?: 'personal' | 'workspace';
  creditWsId?: string | null;
  modelId?: string | null;
  systemPrompt?: string | null;
  thinkingMode?: 'fast' | 'thinking';
};

export type ChatAiSettingsRow = {
  auto_reply?: boolean | null;
  conversation_id?: string | null;
  credit_source?: 'personal' | 'workspace' | null;
  credit_ws_id?: string | null;
  enabled?: boolean | null;
  model_id?: string | null;
  system_prompt?: string | null;
  thinking_mode?: 'fast' | 'thinking' | null;
  updated_at?: string | null;
};

export type NativeChatAiSettings = {
  credit_source: 'personal' | 'workspace';
  credit_ws_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  thinking_mode: 'fast' | 'thinking';
};

type DbErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

export class ChatAiSettingsSchemaCacheStaleError extends Error {
  code = 'chat_ai_settings_schema_cache_stale';

  constructor() {
    super('Chat AI settings schema metadata is still reloading');
    this.name = 'ChatAiSettingsSchemaCacheStaleError';
  }
}

export function isChatAiSettingsSchemaCacheError(error: unknown) {
  const serialized = serializeChatAiSettingsDbError(error);
  const text = [serialized.message, serialized.details, serialized.hint]
    .filter(Boolean)
    .join(' ');

  return (
    serialized.code === '42703' ||
    serialized.code === 'PGRST204' ||
    /schema cache|column .* does not exist/iu.test(text)
  );
}

export function serializeChatAiSettingsDbError(error: unknown) {
  const record = isRecord(error) ? (error as DbErrorLike) : {};

  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    details: typeof record.details === 'string' ? record.details : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
    message:
      typeof record.message === 'string'
        ? record.message
        : error instanceof Error
          ? error.message
          : undefined,
  };
}

export function buildFullChatAiSettingsUpdatePayload(
  payload: ChatAiSettingsPatch
) {
  return {
    ...(payload.creditSource !== undefined
      ? { credit_source: payload.creditSource }
      : {}),
    ...(payload.creditWsId !== undefined
      ? { credit_ws_id: payload.creditWsId }
      : {}),
    ...(payload.modelId !== undefined ? { model_id: payload.modelId } : {}),
    ...(payload.systemPrompt !== undefined
      ? { system_prompt: payload.systemPrompt }
      : {}),
    ...(payload.thinkingMode !== undefined
      ? { thinking_mode: payload.thinkingMode }
      : {}),
  };
}

export function buildLegacyChatAiSettingsUpdatePayload(
  payload: ChatAiSettingsPatch
) {
  return {
    ...(payload.modelId !== undefined ? { model_id: payload.modelId } : {}),
    ...(payload.systemPrompt !== undefined
      ? { system_prompt: payload.systemPrompt }
      : {}),
  };
}

export function hasNewChatAiSettingsPatchFields(payload: ChatAiSettingsPatch) {
  return (
    payload.creditSource !== undefined ||
    payload.creditWsId !== undefined ||
    payload.thinkingMode !== undefined
  );
}

export function mapChatAiSettingsRow({
  conversationId,
  personalWorkspaceId,
  row,
}: {
  conversationId: string;
  personalWorkspaceId: string | null;
  row: ChatAiSettingsRow | null;
}) {
  return {
    autoReply: row?.auto_reply ?? true,
    conversationId,
    creditSource: row?.credit_source ?? 'workspace',
    creditWsId: row?.credit_ws_id ?? null,
    enabled: row?.enabled ?? true,
    modelId: normalizeAiModelId(row?.model_id ?? null),
    personalWorkspaceId,
    systemPrompt: row?.system_prompt ?? null,
    thinkingMode: row?.thinking_mode ?? 'fast',
    updatedAt: row?.updated_at ?? null,
  };
}

export function mapNativeChatAiSettingsRow(
  row: Partial<NativeChatAiSettings> | null
): NativeChatAiSettings {
  return {
    credit_source: row?.credit_source === 'personal' ? 'personal' : 'workspace',
    credit_ws_id:
      typeof row?.credit_ws_id === 'string' ? row.credit_ws_id : null,
    model_id: row?.model_id ?? null,
    system_prompt: row?.system_prompt ?? null,
    thinking_mode: row?.thinking_mode === 'thinking' ? 'thinking' : 'fast',
  };
}

export function normalizeAiModelId(modelId?: string | null) {
  if (!modelId?.trim()) return 'google/gemini-3-flash';
  const trimmed = modelId.trim();
  return trimmed.includes('/') ? trimmed : `google/${trimmed}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
