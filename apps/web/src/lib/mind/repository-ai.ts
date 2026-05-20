import 'server-only';

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
  return callMindRpc<MindAiPatchRecord | null>('mind_apply_ai_patch', {
    p_patch_id: patchId,
    p_user_id: userId,
    p_ws_id: wsId,
  });
}
