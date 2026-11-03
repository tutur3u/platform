import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  type AiDataScope,
  evaluateWorkspaceAiPolicy,
  workspaceAiRefusal,
} from './workspace-ai-policy';

// Option B: flip this single reviewed constant to true.
const BLOCK_ALL_EDUCATION_MEMBERS = false;

/** Always read current policy; billing workspace and provider choice cannot override it. */
export async function workspaceAiAllowed(
  wsId: string | null | undefined,
  dataScope: AiDataScope = 'unknown',
  userId?: string,
  resolveEducationContext = false
): Promise<boolean> {
  try {
    const db = await createAdminClient();
    let policyWsId = wsId;
    if (!policyWsId && userId) {
      const personal = await db
        .from('workspaces')
        .select('id,workspace_members!inner(user_id)')
        .eq('personal', true)
        .eq('workspace_members.user_id', userId)
        .maybeSingle();
      if (personal.error) return false;
      policyWsId = personal.data?.id;
    }
    if (!policyWsId) return false;
    const workspace = await db
      .from('workspaces')
      .select('id,personal,creator_id')
      .eq('id', policyWsId)
      .maybeSingle();
    if (workspace.error || !workspace.data) return false;
    const policyUserId =
      userId ??
      (workspace.data.personal ? workspace.data.creator_id : undefined);
    if (workspace.data.personal && !policyUserId) return false;
    const ids = new Set([policyWsId]);
    // Personal billing must not escape an education context. Unknown roles are learners.
    if (policyUserId && (workspace.data.personal || resolveEducationContext)) {
      const { data, error } = await db
        .from('workspace_members')
        .select('ws_id')
        .eq('user_id', policyUserId);
      if (error || !data || data.length >= 1000) return false;
      for (const row of data) ids.add(row.ws_id);
    }
    const { data, error } = await db
      .from('workspace_secrets')
      .select('ws_id,name,value')
      .in('ws_id', [...ids])
      .in('name', ['AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION']);
    if (error || !data || data.length >= 1000) return false;
    for (const id of ids) {
      const rows = data.filter((row) => row.ws_id === id);
      if (
        rows.some((row) => row.value === null) ||
        new Set(rows.map((row) => row.name)).size !== rows.length
      )
        return false;
      const value = (name: string) =>
        rows.find((row) => row.name === name)?.value ?? undefined;
      const education = value('ENABLE_EDUCATION');
      if (
        education !== undefined &&
        education !== 'false' &&
        education !== 'true'
      )
        return false;
      if (id !== policyWsId && education !== 'true') continue;
      if (
        id !== policyWsId &&
        education === 'true' &&
        workspace.data.personal &&
        !resolveEducationContext
      ) {
        if (BLOCK_ALL_EDUCATION_MEMBERS || !policyUserId) return false;
        const educationWorkspace = await db
          .from('workspaces')
          .select('creator_id')
          .eq('id', id)
          .maybeSingle();
        if (educationWorkspace.error || !educationWorkspace.data) return false;
        if (educationWorkspace.data.creator_id === policyUserId) continue;
        const roles = await db
          .from('workspace_role_members')
          .select(
            'workspace_roles!inner(ws_id,workspace_role_permissions(ws_id,permission,enabled))'
          )
          .eq('user_id', policyUserId)
          .eq('workspace_roles.ws_id', id);
        if (
          roles.error ||
          !roles.data ||
          roles.data.length === 0 ||
          roles.data.length >= 1000 ||
          roles.data.some((row) => {
            const role = row.workspace_roles;
            const permissions = role?.workspace_role_permissions;
            return (
              role?.ws_id !== id ||
              !permissions ||
              permissions.length >= 1000 ||
              !permissions.some(
                (permission) =>
                  permission.ws_id === id &&
                  permission.enabled === true &&
                  (permission.permission === 'manage_workspace_roles' ||
                    permission.permission === 'update_user_groups')
              )
            );
          })
        )
          return false;
        continue;
      }
      if (
        !evaluateWorkspaceAiPolicy(
          {
            enabled: value('AI_ENABLED'),
            education: education === 'true',
            scope: value('AI_EDUCATION_SCOPE'),
          },
          dataScope
        )
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function workspaceAiPolicyResponse(
  wsId: string | null | undefined,
  userId?: string,
  locale = 'en',
  dataScope: AiDataScope = 'unknown',
  resolveEducationContext = false
) {
  if (
    await workspaceAiAllowed(wsId, dataScope, userId, resolveEducationContext)
  )
    return null;
  const refusal = workspaceAiRefusal(locale);
  return NextResponse.json(await refusal.json(), { status: 403 });
}
