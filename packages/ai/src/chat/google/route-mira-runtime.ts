import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
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
  timezone?: string;
  /** Optional callback for render_ui context-aware fallback. */
  getSteps?: () => unknown[];
};

export async function prepareMiraRuntime({
  isMiraMode,
  wsId,
  workspaceContextId,
  creditWsId,
  request,
  userId,
  chatId,
  supabase,
  timezone,
  getSteps,
}: PrepareMiraRuntimeParams): Promise<{
  miraSystemPrompt?: string;
  miraTools?: ReturnType<typeof createMiraStreamTools>;
}> {
  if (!isMiraMode || !wsId) {
    return {};
  }

  let resolvedWorkspaceContext: MiraWorkspaceContextState;
  try {
    resolvedWorkspaceContext = await resolveWorkspaceContextState({
      supabase,
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
  try {
    const permissionsResult = (await getPermissions({
      wsId: resolvedWorkspaceContext.wsId,
      request,
    })) as PermissionResultLike | null;
    if (permissionsResult) {
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
    supabase,
    timezone,
  };

  let miraSystemPrompt: string;
  try {
    const { contextString, soul, isFirstInteraction } =
      await buildMiraContext(ctx);
    const dynamicInstruction = buildMiraSystemInstruction({
      soul,
      isFirstInteraction,
      withoutPermission,
    });
    const workspaceContextInstruction = `## Workspace Context\n\nCurrent task/calendar/finance workspace context: ${resolvedWorkspaceContext.name} (${resolvedWorkspaceContext.personal ? 'personal' : 'shared'} workspace).\nUse this workspace for "my tasks", "my calendar", and "my finance" requests. Only switch to another workspace when the user explicitly names a different workspace.`;
    miraSystemPrompt = `${contextString}\n\n${workspaceContextInstruction}\n\n${dynamicInstruction}`;
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
