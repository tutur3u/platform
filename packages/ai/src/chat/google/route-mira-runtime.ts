import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { normalizeWorkspaceContextId } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { buildMiraContext } from '../../tools/context-builder';
import {
  createMiraStreamTools,
  type MiraToolContext,
} from '../../tools/mira-tools';
import type { MiraWorkspaceContextState } from '../../tools/workspace-context';
import { resolveWorkspaceContextState } from '../../tools/workspace-context';
import { buildMiraSystemInstruction } from '../mira-system-instruction';
import type { ChatRequestTaskBoardContext } from './chat-request-schema';

type PermissionResultLike = {
  withoutPermission?: (permission: unknown) => boolean;
};

type SupabaseClientLike = TypedSupabaseClient;

type PrepareMiraRuntimeParams = {
  isMiraMode?: boolean;
  wsId?: string;
  workspaceContextId?: string;
  creditWsId?: string;
  request: NextRequest;
  userId: string;
  chatId: string;
  supabase: SupabaseClientLike;
  toolSupabase?: SupabaseClientLike;
  timezone?: string;
  taskBoardContext?: ChatRequestTaskBoardContext;
  /** Optional callback for render_ui context-aware fallback. */
  getSteps?: () => unknown[];
};

function formatTaskBoardReference({
  boardId,
  boardName,
}: ChatRequestTaskBoardContext) {
  return boardName ? `${boardName} (${boardId})` : boardId;
}

function buildTaskBoardContextInstruction({
  resolvedWorkspaceContext,
  taskBoardContext,
}: {
  resolvedWorkspaceContext: MiraWorkspaceContextState;
  taskBoardContext?: ChatRequestTaskBoardContext;
}) {
  if (!taskBoardContext) return null;

  const workspaceName =
    taskBoardContext.workspaceName?.trim() || resolvedWorkspaceContext.name;
  const workspaceId = normalizeWorkspaceContextId(
    taskBoardContext.workspaceId || resolvedWorkspaceContext.wsId
  );
  const workspaceKind = resolvedWorkspaceContext.personal
    ? 'personal workspace'
    : 'shared workspace';
  const selectedList = taskBoardContext.selectedList ?? null;
  const selectedListName = selectedList?.name?.trim() || 'Untitled list';
  const selectedListStatus = selectedList?.status?.trim() || 'unknown';
  const selectedListLine = selectedList
    ? `Selected/default task list: ${selectedListName} [${selectedListStatus}] (list id: ${selectedList.id}).`
    : 'Selected/default task list: none selected in the client yet.';
  const listLines =
    taskBoardContext.lists.length > 0
      ? taskBoardContext.lists
          .map((list) => {
            const listName = list.name?.trim() || 'Untitled list';
            const status = list.status?.trim() || 'unknown';
            return `- ${listName} [${status}] (list id: ${list.id})`;
          })
          .join('\n')
      : '- No task lists are currently loaded in the client.';

  return `## Current Task Board

The user is currently viewing workspace ${workspaceName} (${workspaceKind}).
- Current workspace id: ${workspaceId}
- Current task board: ${formatTaskBoardReference(taskBoardContext)}
- Current board id: ${taskBoardContext.boardId}
- ${selectedListLine}

Visible task lists on this board:
${listLines}

Use these list names and statuses when the user refers to "this board", "this task board", or asks to create or move board tasks. The current workspace id and current board id above are authoritative, including ids that look like all-zero UUIDs or ids that map from the "internal" slug. Prefer these known workspace/board/list ids over rediscovering the same context. Do not reject the current workspace id based on its shape or display name, and do not call workspace context tools just to rediscover this board context.`;
}

export async function prepareMiraRuntime({
  isMiraMode,
  wsId,
  workspaceContextId,
  creditWsId,
  request,
  userId,
  chatId,
  supabase,
  toolSupabase,
  timezone,
  taskBoardContext,
  getSteps,
}: PrepareMiraRuntimeParams): Promise<{
  miraSystemPrompt?: string;
  miraTools?: ReturnType<typeof createMiraStreamTools>;
}> {
  if (!isMiraMode || !wsId) {
    return {};
  }

  const miraSupabase = toolSupabase ?? supabase;

  let resolvedWorkspaceContext: MiraWorkspaceContextState;
  try {
    resolvedWorkspaceContext = await resolveWorkspaceContextState({
      supabase: miraSupabase,
      userId,
      requestedWorkspaceContextId: workspaceContextId,
      fallbackWorkspaceId: wsId,
    });
  } catch (workspaceContextErr) {
    console.error(
      'Failed to resolve Mira workspace context, falling back to current workspace:',
      workspaceContextErr
    );
    resolvedWorkspaceContext = {
      workspaceContextId: wsId,
      wsId,
      name: 'Current workspace',
      personal: false,
      memberCount: 0,
    };
  }

  let withoutPermission: PermissionResultLike['withoutPermission'];
  const denyPermissionByDefault = () => true;
  withoutPermission = denyPermissionByDefault;
  try {
    const permissionsResult = (await getPermissions({
      wsId: resolvedWorkspaceContext.wsId,
      request,
    })) as PermissionResultLike | null;
    if (permissionsResult?.withoutPermission) {
      withoutPermission = permissionsResult.withoutPermission;
    }
  } catch (permErr) {
    console.error('Failed to get permissions for Mira tools:', permErr);
  }

  const ctx: MiraToolContext = {
    userId,
    wsId,
    creditWsId,
    workspaceContext: resolvedWorkspaceContext,
    chatId,
    supabase: miraSupabase,
    timezone,
  };

  let miraSystemPrompt: string;
  try {
    const { contextString, soul, isFirstInteraction } = await buildMiraContext({
      userId,
      wsId: resolvedWorkspaceContext.wsId,
      supabase: miraSupabase,
      timezone,
      withoutPermission,
    });
    const dynamicInstruction = buildMiraSystemInstruction({
      soul,
      isFirstInteraction,
      withoutPermission,
    });
    const workspaceContextInstruction = `## Workspace Context\n\nCurrent task/calendar/finance workspace context: ${resolvedWorkspaceContext.name} (${resolvedWorkspaceContext.personal ? 'personal' : 'shared'} workspace).\nUse this workspace for "my tasks", "my calendar", and "my finance" requests. Only switch to another workspace when the user explicitly names a different workspace.`;
    const taskBoardContextInstruction = buildTaskBoardContextInstruction({
      resolvedWorkspaceContext,
      taskBoardContext,
    });
    miraSystemPrompt = [
      contextString,
      workspaceContextInstruction,
      taskBoardContextInstruction,
      dynamicInstruction,
    ]
      .filter(Boolean)
      .join('\n\n');
  } catch (ctxErr) {
    console.error(
      'Failed to build Mira context (continuing with default instruction):',
      ctxErr
    );
    miraSystemPrompt = buildMiraSystemInstruction({ withoutPermission });
  }

  return {
    miraSystemPrompt,
    miraTools: createMiraStreamTools(ctx, withoutPermission, getSteps),
  };
}
