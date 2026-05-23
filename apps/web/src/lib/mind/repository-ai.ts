import 'server-only';

import { orderMindPatchOperationsForApply } from '@tuturuuu/ai/mind/tools';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  MindAiPatch,
  MindAiPatchRecord,
  MindJsonObject,
} from '@tuturuuu/types/db';
import { callMindRpc } from './repository-rpc';

export async function createMindAiPatch({
  boardId,
  patch,
  summary,
  threadId,
  userId,
  wsId,
}: {
  boardId: string;
  patch: MindAiPatch;
  summary: string;
  threadId?: string | null;
  userId: string;
  wsId: string;
}) {
  return callMindRpc<MindAiPatchRecord | null>('mind_create_ai_patch', {
    p_board_id: boardId,
    p_patch: patch,
    p_summary: summary,
    p_thread_id: threadId ?? null,
    p_user_id: userId,
    p_ws_id: wsId,
  });
}

export async function ensureMindAiThread({
  boardId,
  model,
  threadId,
  userId,
  writeMode,
  wsId,
}: {
  boardId?: string | null;
  model?: string | null;
  threadId?: string | null;
  userId: string;
  writeMode: 'direct' | 'review';
  wsId: string;
}) {
  const resolvedId = await callMindRpc<string>('mind_ensure_ai_thread', {
    p_board_id: boardId ?? null,
    p_model: model ?? null,
    p_thread_id: threadId ?? null,
    p_user_id: userId,
    p_write_mode: writeMode,
    p_ws_id: wsId,
  });

  if (!resolvedId) {
    throw new Error('Failed to create Mind AI thread');
  }

  return resolvedId;
}

export async function persistMindAiMessage({
  boardId,
  content,
  metadata,
  model,
  role,
  threadId,
  toolCalls,
  toolResults,
  usage,
  userId,
  wsId,
}: {
  boardId?: string | null;
  content: string;
  metadata?: MindJsonObject;
  model?: string | null;
  role: 'assistant' | 'system' | 'tool' | 'user';
  threadId: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  usage?: MindJsonObject;
  userId: string;
  wsId: string;
}) {
  await callMindRpc<boolean>('mind_persist_ai_message', {
    p_board_id: boardId ?? null,
    p_content: content,
    p_metadata: metadata ?? {},
    p_model: model ?? null,
    p_role: role,
    p_thread_id: threadId,
    p_tool_calls: toolCalls ?? [],
    p_tool_results: toolResults ?? [],
    p_usage: usage ?? {},
    p_user_id: userId,
    p_ws_id: wsId,
  });
}

export async function applyMindAiPatch({
  patchId,
  userId,
  wsId,
}: {
  patchId: string;
  userId: string;
  wsId: string;
}) {
  await normalizeStoredPatchOperationOrder({ patchId, wsId });

  return callMindRpc<MindAiPatchRecord | null>('mind_apply_ai_patch', {
    p_patch_id: patchId,
    p_user_id: userId,
    p_ws_id: wsId,
  });
}

type MindPatchQueryResult = {
  data: unknown;
  error: { message?: string } | null;
};
type MindPatchSelectQuery = {
  eq(column: string, value: string): MindPatchSelectQuery;
  maybeSingle(): Promise<MindPatchQueryResult>;
  select(columns: string): MindPatchSelectQuery;
};
type MindPatchUpdateQuery = PromiseLike<MindPatchQueryResult> & {
  eq(column: string, value: string): MindPatchUpdateQuery;
};
type MindPatchTableClient = {
  from(table: string): {
    select(columns: string): MindPatchSelectQuery;
    update(values: Record<string, unknown>): MindPatchUpdateQuery;
  };
};

async function normalizeStoredPatchOperationOrder({
  patchId,
  wsId,
}: {
  patchId: string;
  wsId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateClient = getPrivateTableClient(sbAdmin);
  const { data, error } = await privateClient
    .from('mind_ai_patches')
    .select('patch,status')
    .eq('id', patchId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Failed to load Mind AI patch');
  }
  if (!isRecord(data) || data.status !== 'draft') return;
  if (!isMindAiPatch(data.patch)) return;

  const orderedOperations = orderMindPatchOperationsForApply(
    data.patch.operations
  );
  if (
    JSON.stringify(orderedOperations) === JSON.stringify(data.patch.operations)
  ) {
    return;
  }

  const updateResult = await privateClient
    .from('mind_ai_patches')
    .update({
      patch: {
        ...data.patch,
        operations: orderedOperations,
      },
    })
    .eq('id', patchId)
    .eq('ws_id', wsId);

  if (updateResult.error) {
    throw new Error(
      updateResult.error.message ?? 'Failed to normalize Mind AI patch'
    );
  }
}

function getPrivateTableClient(client: unknown) {
  if (isRecord(client) && typeof client.schema === 'function') {
    return client.schema('private') as MindPatchTableClient;
  }

  return client as MindPatchTableClient;
}

function isMindAiPatch(value: unknown): value is MindAiPatch {
  return (
    isRecord(value) &&
    typeof value.summary === 'string' &&
    Array.isArray(value.operations)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
