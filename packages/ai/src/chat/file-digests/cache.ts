import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { CHAT_FILE_DIGEST_VERSION, FILE_DIGEST_MODEL } from './constants';
import type { ChatFileDigest, ChatFileDigestDbRow } from './types';

type AdminClientLike = unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeDigest(row: ChatFileDigestDbRow): ChatFileDigest {
  const structured = isRecord(row.structured) ? row.structured : {};
  const limitations = toStringArray(row.limitations);

  return {
    answerContextMarkdown: row.answer_context_markdown ?? '',
    digestVersion: row.digest_version,
    displayName: row.display_name,
    extractedMarkdown: row.extracted_markdown,
    fileName: row.file_name,
    keyFacts: toStringArray(structured.keyFacts),
    limitations:
      limitations.length > 0
        ? limitations
        : toStringArray(structured.limitations),
    mediaType: row.media_type,
    processorModel: row.processor_model,
    status: row.status === 'failed' ? 'failed' : 'ready',
    storagePath: row.storage_path,
    suggestedAlias:
      typeof row.suggested_alias === 'string' && row.suggested_alias.length > 0
        ? row.suggested_alias
        : null,
    summary: row.summary ?? '',
    title: row.title ?? '',
  };
}

export async function getReadyChatFileDigest(
  storagePath: string,
  digestVersion = CHAT_FILE_DIGEST_VERSION,
  sbAdmin?: AdminClientLike
): Promise<ChatFileDigest | null> {
  const client = (sbAdmin ??
    ((await createAdminClient()) as unknown as AdminClientLike)) as any;
  const { data, error } = await client
    .from('ai_chat_file_digests')
    .select('*')
    .eq('storage_path', storagePath)
    .eq('digest_version', digestVersion)
    .eq('status', 'ready')
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch ready chat file digest:', {
      storagePath,
      error: error.message,
    });
    return null;
  }

  return data ? normalizeDigest(data) : null;
}

export async function listChatFileDigestStatuses(
  storagePaths: string[],
  digestVersion = CHAT_FILE_DIGEST_VERSION,
  sbAdmin?: AdminClientLike
): Promise<Map<string, 'ready' | 'failed' | 'processing'>> {
  const normalizedPaths = [...new Set(storagePaths.filter(Boolean))];
  if (normalizedPaths.length === 0) {
    return new Map();
  }

  const client = (sbAdmin ??
    ((await createAdminClient()) as unknown as AdminClientLike)) as any;
  const query = client
    .from('ai_chat_file_digests')
    .select('storage_path, status, updated_at');
  const { data, error } = await query
    .in('storage_path', normalizedPaths)
    .eq('digest_version', digestVersion)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to list chat file digests:', {
      count: normalizedPaths.length,
      error: error.message,
    });
    return new Map();
  }

  const statuses = new Map<string, 'ready' | 'failed' | 'processing'>();
  for (const row of data ?? []) {
    if (!statuses.has(row.storage_path)) {
      statuses.set(
        row.storage_path,
        row.status === 'ready' || row.status === 'failed'
          ? row.status
          : 'processing'
      );
    }
  }

  return statuses;
}

type BaseDigestWriteParams = {
  chatId: string;
  displayName: string;
  fileName: string;
  mediaType: string;
  messageId?: string | null;
  processorModel?: string;
  size?: number;
  storagePath: string;
  wsId: string;
};

async function upsertDigestWithMessageFallback(
  client: any,
  payload: Record<string, unknown>,
  options?: { onConflict: string; selectSingle?: boolean }
) {
  const runUpsert = async (nextPayload: Record<string, unknown>) => {
    const query = client.from('ai_chat_file_digests').upsert(nextPayload, {
      onConflict: options?.onConflict ?? 'storage_path,digest_version',
    });

    if (options?.selectSingle) {
      return query.select('*').single();
    }

    return query;
  };

  let result = await runUpsert(payload);
  let error = result.error;

  if (
    error?.message?.includes('ai_chat_file_digests_message_id_fkey') &&
    payload.message_id
  ) {
    result = await runUpsert({
      ...payload,
      message_id: null,
    });
    error = result.error;
  }

  return result;
}

export async function upsertProcessingChatFileDigest(
  params: BaseDigestWriteParams,
  sbAdmin?: AdminClientLike
): Promise<void> {
  const client = (sbAdmin ??
    ((await createAdminClient()) as unknown as AdminClientLike)) as any;
  const { error } = await upsertDigestWithMessageFallback(client, {
    chat_id: params.chatId,
    digest_version: CHAT_FILE_DIGEST_VERSION,
    display_name: params.displayName,
    file_name: params.fileName,
    file_size: params.size ?? null,
    media_type: params.mediaType,
    message_id: params.messageId ?? null,
    processor_model: params.processorModel ?? FILE_DIGEST_MODEL,
    status: 'processing',
    storage_path: params.storagePath,
    ws_id: params.wsId,
  });

  if (error) {
    console.error('Failed to upsert processing chat file digest:', {
      storagePath: params.storagePath,
      error: error.message,
    });
  }
}

type ReadyDigestParams = BaseDigestWriteParams & {
  answerContextMarkdown: string;
  extractedMarkdown: string | null;
  keyFacts: string[];
  limitations: string[];
  suggestedAlias: string | null;
  summary: string;
  title: string;
};

export async function saveReadyChatFileDigest(
  params: ReadyDigestParams,
  sbAdmin?: AdminClientLike
): Promise<ChatFileDigest | null> {
  const client = (sbAdmin ??
    ((await createAdminClient()) as unknown as AdminClientLike)) as any;
  const payload = {
    answer_context_markdown: params.answerContextMarkdown,
    chat_id: params.chatId,
    digest_version: CHAT_FILE_DIGEST_VERSION,
    display_name: params.displayName,
    error_message: null,
    extracted_markdown: params.extractedMarkdown,
    file_name: params.fileName,
    file_size: params.size ?? null,
    limitations: params.limitations as unknown as Json,
    media_type: params.mediaType,
    message_id: params.messageId ?? null,
    processor_model: params.processorModel ?? FILE_DIGEST_MODEL,
    status: 'ready',
    storage_path: params.storagePath,
    structured: {
      keyFacts: params.keyFacts,
      limitations: params.limitations,
    } as Json,
    suggested_alias: params.suggestedAlias,
    summary: params.summary,
    title: params.title,
    ws_id: params.wsId,
  };

  const { data, error } = await upsertDigestWithMessageFallback(
    client,
    payload,
    {
      onConflict: 'storage_path,digest_version',
      selectSingle: true,
    }
  );

  if (error) {
    console.error('Failed to save ready chat file digest:', {
      storagePath: params.storagePath,
      error: error.message,
    });
    return null;
  }

  return normalizeDigest(data);
}

export async function saveFailedChatFileDigest(
  params: BaseDigestWriteParams & {
    errorMessage: string;
  },
  sbAdmin?: AdminClientLike
): Promise<void> {
  const client = (sbAdmin ??
    ((await createAdminClient()) as unknown as AdminClientLike)) as any;
  const { error } = await upsertDigestWithMessageFallback(client, {
    chat_id: params.chatId,
    digest_version: CHAT_FILE_DIGEST_VERSION,
    display_name: params.displayName,
    error_message: params.errorMessage,
    file_name: params.fileName,
    file_size: params.size ?? null,
    media_type: params.mediaType,
    message_id: params.messageId ?? null,
    processor_model: params.processorModel ?? FILE_DIGEST_MODEL,
    status: 'failed',
    storage_path: params.storagePath,
    ws_id: params.wsId,
  });

  if (error) {
    console.error('Failed to save failed chat file digest:', {
      storagePath: params.storagePath,
      error: error.message,
    });
  }
}
