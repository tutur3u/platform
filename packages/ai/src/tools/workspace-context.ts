import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { PERSONAL_WORKSPACE_SLUG } from '@tuturuuu/utils/constants';
import type { MiraToolContext } from './mira-tool-types';

type WorkspaceMembershipRow = {
  ws_id: string | null;
  workspaces:
    | {
        id: string;
        name: string | null;
        personal: boolean | null;
      }
    | Array<{
        id: string;
        name: string | null;
        personal: boolean | null;
      }>
    | null;
};

type WorkspaceMemberRow = {
  ws_id: string | null;
};

export type MiraWorkspaceSummary = {
  id: string;
  name: string;
  personal: boolean;
  memberCount: number;
};

export type MiraWorkspaceContextState = {
  workspaceContextId: string;
  wsId: string;
  name: string;
  personal: boolean;
  memberCount: number;
};

export function getWorkspaceContextWorkspaceId(ctx: MiraToolContext): string {
  return ctx.workspaceContext?.wsId ?? ctx.wsId;
}

function toWorkspaceContextState(
  workspace: MiraWorkspaceSummary,
  workspaceContextId: string
): MiraWorkspaceContextState {
  return {
    workspaceContextId,
    wsId: workspace.id,
    name: workspace.name,
    personal: workspace.personal,
    memberCount: workspace.memberCount,
  };
}

export async function listAccessibleWorkspaceSummaries(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<MiraWorkspaceSummary[]> {
  const { data: membershipData, error: membershipError } = await supabase
    .from('workspace_members')
    .select(
      `
        ws_id,
        workspaces!inner (
          id,
          name,
          personal
        )
      `
    )
    .eq('user_id', userId);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const memberships = (membershipData ?? []) as WorkspaceMembershipRow[];
  const workspaceMap = new Map<
    string,
    Omit<MiraWorkspaceSummary, 'memberCount'>
  >();

  for (const membership of memberships) {
    const workspace = Array.isArray(membership.workspaces)
      ? (membership.workspaces[0] ?? null)
      : membership.workspaces;

    if (!membership.ws_id || !workspace?.id) continue;

    workspaceMap.set(workspace.id, {
      id: workspace.id,
      name: workspace.name?.trim() || 'Untitled workspace',
      personal: workspace.personal === true,
    });
  }

  const workspaceIds = [...workspaceMap.keys()];
  if (workspaceIds.length === 0) {
    return [];
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .in('ws_id', workspaceIds);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const memberCounts = new Map<string, number>();
  for (const row of (memberRows ?? []) as WorkspaceMemberRow[]) {
    if (!row.ws_id) continue;
    memberCounts.set(row.ws_id, (memberCounts.get(row.ws_id) ?? 0) + 1);
  }

  return workspaceIds
    .map((id) => {
      const workspace = workspaceMap.get(id)!;
      return {
        ...workspace,
        memberCount: memberCounts.get(id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.personal !== b.personal) {
        return a.personal ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

type ResolveWorkspaceContextParams = {
  supabase: TypedSupabaseClient;
  userId: string;
  requestedWorkspaceContextId?: string;
  fallbackWorkspaceId?: string;
  strict?: boolean;
};

export async function resolveWorkspaceContextState({
  supabase,
  userId,
  requestedWorkspaceContextId,
  fallbackWorkspaceId,
  strict = false,
}: ResolveWorkspaceContextParams): Promise<MiraWorkspaceContextState> {
  const accessibleWorkspaces = await listAccessibleWorkspaceSummaries(
    supabase,
    userId
  );

  if (accessibleWorkspaces.length === 0) {
    throw new Error('No accessible workspaces found for current user.');
  }

  const personalWorkspace =
    accessibleWorkspaces.find((workspace) => workspace.personal) ?? null;
  const fallbackWorkspace =
    (fallbackWorkspaceId
      ? accessibleWorkspaces.find(
          (workspace) => workspace.id === fallbackWorkspaceId
        )
      : null) ??
    personalWorkspace ??
    accessibleWorkspaces[0]!;

  const requested = requestedWorkspaceContextId?.trim();
  if (!requested) {
    return toWorkspaceContextState(
      fallbackWorkspace,
      fallbackWorkspace.personal
        ? PERSONAL_WORKSPACE_SLUG
        : fallbackWorkspace.id
    );
  }

  if (requested.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    if (!personalWorkspace) {
      if (strict) {
        throw new Error('Personal workspace is not available for this user.');
      }
      return toWorkspaceContextState(
        fallbackWorkspace,
        fallbackWorkspace.personal
          ? PERSONAL_WORKSPACE_SLUG
          : fallbackWorkspace.id
      );
    }

    return toWorkspaceContextState(personalWorkspace, PERSONAL_WORKSPACE_SLUG);
  }

  const directMatch = accessibleWorkspaces.find(
    (workspace) => workspace.id === requested
  );
  if (directMatch) {
    return toWorkspaceContextState(
      directMatch,
      directMatch.personal ? PERSONAL_WORKSPACE_SLUG : directMatch.id
    );
  }

  const nameMatches = accessibleWorkspaces.filter(
    (workspace) => workspace.name.toLowerCase() === requested.toLowerCase()
  );
  if (nameMatches.length === 1) {
    return toWorkspaceContextState(
      nameMatches[0]!,
      nameMatches[0]!.personal ? PERSONAL_WORKSPACE_SLUG : nameMatches[0]!.id
    );
  }

  if (strict) {
    throw new Error(
      nameMatches.length > 1
        ? `Workspace name "${requested}" is ambiguous. Use the workspace ID instead.`
        : `Workspace "${requested}" is not accessible for this user.`
    );
  }

  return toWorkspaceContextState(
    fallbackWorkspace,
    fallbackWorkspace.personal ? PERSONAL_WORKSPACE_SLUG : fallbackWorkspace.id
  );
}
