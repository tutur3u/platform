import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { workspaceAiPolicyResponse } from '@tuturuuu/utils/workspace-ai-policy-server';
import {
  type InitialMiraWorkspaceContext,
  resolveInitialMiraWorkspaceContext,
} from './route-mira-runtime';

/**
 * The initial Mira prompt reads the requested context workspace, which can
 * differ from the already policy-checked route workspace. Resolve it once and
 * apply the same policy as a later context switch before any of its data,
 * credits or provider selection is touched.
 */
export async function admitInitialMiraWorkspaceContext({
  isMiraMode,
  locale,
  supabase,
  userId,
  workspaceContextId,
  wsId,
}: {
  isMiraMode?: boolean;
  locale: string;
  supabase: TypedSupabaseClient;
  userId: string;
  workspaceContextId?: string;
  wsId: string | null;
}): Promise<
  | { refusal: Response; context?: undefined }
  | { refusal?: undefined; context?: InitialMiraWorkspaceContext }
> {
  if (!isMiraMode || !wsId) return {};
  const context = await resolveInitialMiraWorkspaceContext({
    supabase,
    userId,
    workspaceContextId,
    wsId,
  });
  if (context.ok && context.context.wsId !== wsId) {
    const refusal = await workspaceAiPolicyResponse(
      context.context.wsId,
      userId,
      locale,
      'unknown',
      true
    );
    if (refusal) return { refusal };
  }
  return { context };
}
