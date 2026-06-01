import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types/db';
import {
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';

type WorkspaceMemberType = Database['public']['Enums']['workspace_member_type'];

export type WorkspaceInviteStatus = 'member' | 'pending_invite' | 'none';
export type WorkspaceInviteSource = 'direct' | 'email';

export type WorkspaceInvitationWorkspace = {
  avatar_url: string | null;
  handle: string | null;
  id: string;
  logo_url: string | null;
  name: string | null;
  personal: boolean;
};

export type WorkspaceInvitationRecord = {
  createdAt: string | null;
  matchedEmail: string | null;
  source: WorkspaceInviteSource;
  type: WorkspaceMemberType;
  workspace: WorkspaceInvitationWorkspace;
};

export type WorkspaceInviteStatusResult =
  | {
      status: 'member';
      workspace: WorkspaceInvitationWorkspace;
    }
  | {
      invitation: WorkspaceInvitationRecord;
      status: 'pending_invite';
      workspace: WorkspaceInvitationWorkspace;
    }
  | {
      status: 'none';
      workspace: WorkspaceInvitationWorkspace | null;
    };

type WorkspaceRow = {
  avatar_url: string | null;
  handle: string | null;
  id: string;
  logo_url: string | null;
  name: string | null;
  personal: boolean | null;
};

type DirectInviteRow = {
  created_at: string | null;
  type: WorkspaceMemberType;
  ws_id: string;
};

type EmailInviteRow = DirectInviteRow & {
  email: string;
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function uniqueEmails(...emails: Array<string | null | undefined>) {
  return [
    ...new Set(
      emails
        .map((email) => normalizeEmail(email))
        .filter((email): email is string => Boolean(email))
    ),
  ];
}

function toWorkspaceSummary(
  workspace: WorkspaceRow
): WorkspaceInvitationWorkspace {
  return {
    avatar_url: workspace.avatar_url,
    handle: workspace.handle,
    id: workspace.id,
    logo_url: workspace.logo_url,
    name: workspace.name,
    personal: workspace.personal === true,
  };
}

async function normalizeDirectWorkspaceId(
  admin: TypedSupabaseClient,
  workspaceId: string
) {
  if (isWorkspaceUuidLiteral(workspaceId)) {
    return workspaceId;
  }

  return normalizeWorkspaceId(workspaceId, admin);
}

export async function getWorkspaceInviteCandidateEmails(
  admin: TypedSupabaseClient,
  {
    authEmail,
    userId,
  }: {
    authEmail: string | null | undefined;
    userId: string;
  }
) {
  const { data: privateDetails, error: privateDetailsError } = await admin
    .from('user_private_details')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle();

  if (privateDetailsError) {
    throw privateDetailsError;
  }

  return uniqueEmails(authEmail, privateDetails?.email);
}

async function fetchWorkspace(admin: TypedSupabaseClient, workspaceId: string) {
  const { data, error } = await admin
    .from('workspaces')
    .select('id, name, avatar_url, logo_url, handle, personal')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as WorkspaceRow | null;
}

async function fetchMembershipWorkspaceIds(
  admin: TypedSupabaseClient,
  {
    userId,
    workspaceIds,
  }: {
    userId: string;
    workspaceIds: string[];
  }
) {
  if (workspaceIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await admin
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', userId)
    .in('ws_id', workspaceIds);

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.ws_id));
}

async function fetchDirectInvites(
  admin: TypedSupabaseClient,
  {
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId?: string;
  }
) {
  let query = admin
    .from('workspace_invites')
    .select('ws_id, type, created_at')
    .eq('user_id', userId);

  if (workspaceId) {
    query = query.eq('ws_id', workspaceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as DirectInviteRow[];
}

async function fetchEmailInvites(
  admin: TypedSupabaseClient,
  {
    candidateEmails,
    workspaceId,
  }: {
    candidateEmails: string[];
    workspaceId?: string;
  }
) {
  if (candidateEmails.length === 0) {
    return [] satisfies EmailInviteRow[];
  }

  let query = admin
    .from('workspace_email_invites')
    .select('ws_id, type, created_at, email')
    .in('email', candidateEmails);

  if (workspaceId) {
    query = query.eq('ws_id', workspaceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as EmailInviteRow[];
}

function chooseInviteForWorkspace({
  directInvites,
  emailInvites,
  workspace,
}: {
  directInvites: DirectInviteRow[];
  emailInvites: EmailInviteRow[];
  workspace: WorkspaceInvitationWorkspace;
}): WorkspaceInvitationRecord | null {
  const directInvite = directInvites.find(
    (invite) => invite.ws_id === workspace.id
  );
  if (directInvite) {
    return {
      createdAt: directInvite.created_at,
      matchedEmail: null,
      source: 'direct',
      type: directInvite.type,
      workspace,
    };
  }

  const emailInvite = emailInvites.find(
    (invite) => invite.ws_id === workspace.id
  );
  if (!emailInvite) {
    return null;
  }

  return {
    createdAt: emailInvite.created_at,
    matchedEmail: normalizeEmail(emailInvite.email),
    source: 'email',
    type: emailInvite.type,
    workspace,
  };
}

export async function getWorkspaceInviteStatus(
  admin: TypedSupabaseClient,
  {
    authEmail,
    userId,
    workspaceId,
  }: {
    authEmail: string | null | undefined;
    userId: string;
    workspaceId: string;
  }
): Promise<WorkspaceInviteStatusResult> {
  const normalizedWorkspaceId = await normalizeDirectWorkspaceId(
    admin,
    workspaceId
  );
  const [candidateEmails, workspace, memberWorkspaceIds, directInvites] =
    await Promise.all([
      getWorkspaceInviteCandidateEmails(admin, { authEmail, userId }),
      fetchWorkspace(admin, normalizedWorkspaceId),
      fetchMembershipWorkspaceIds(admin, {
        userId,
        workspaceIds: [normalizedWorkspaceId],
      }),
      fetchDirectInvites(admin, {
        userId,
        workspaceId: normalizedWorkspaceId,
      }),
    ]);

  if (!workspace) {
    return {
      status: 'none',
      workspace: null,
    };
  }

  const workspaceSummary = toWorkspaceSummary(workspace);

  if (memberWorkspaceIds.has(normalizedWorkspaceId)) {
    return {
      status: 'member',
      workspace: workspaceSummary,
    };
  }

  if (workspaceSummary.personal) {
    return {
      status: 'none',
      workspace: workspaceSummary,
    };
  }

  const emailInvites = await fetchEmailInvites(admin, {
    candidateEmails,
    workspaceId: normalizedWorkspaceId,
  });
  const invitation = chooseInviteForWorkspace({
    directInvites,
    emailInvites,
    workspace: workspaceSummary,
  });

  if (!invitation) {
    return {
      status: 'none',
      workspace: workspaceSummary,
    };
  }

  return {
    invitation,
    status: 'pending_invite',
    workspace: workspaceSummary,
  };
}

export async function listPendingWorkspaceInvitations(
  admin: TypedSupabaseClient,
  {
    authEmail,
    userId,
  }: {
    authEmail: string | null | undefined;
    userId: string;
  }
) {
  const candidateEmails = await getWorkspaceInviteCandidateEmails(admin, {
    authEmail,
    userId,
  });
  const [directInvites, emailInvites] = await Promise.all([
    fetchDirectInvites(admin, { userId }),
    fetchEmailInvites(admin, { candidateEmails }),
  ]);
  const workspaceIds = [
    ...new Set([
      ...directInvites.map((invite) => invite.ws_id),
      ...emailInvites.map((invite) => invite.ws_id),
    ]),
  ];

  if (workspaceIds.length === 0) {
    return [] satisfies WorkspaceInvitationRecord[];
  }

  const [memberWorkspaceIds, workspaceRowsResult] = await Promise.all([
    fetchMembershipWorkspaceIds(admin, {
      userId,
      workspaceIds,
    }),
    admin
      .from('workspaces')
      .select('id, name, avatar_url, logo_url, handle, personal')
      .in('id', workspaceIds),
  ]);

  if (workspaceRowsResult.error) {
    throw workspaceRowsResult.error;
  }

  const workspaceRows = (workspaceRowsResult.data ?? []) as WorkspaceRow[];
  const invitations: WorkspaceInvitationRecord[] = [];

  for (const workspace of workspaceRows) {
    if (memberWorkspaceIds.has(workspace.id) || workspace.personal === true) {
      continue;
    }

    const workspaceSummary = toWorkspaceSummary(workspace);
    const invitation = chooseInviteForWorkspace({
      directInvites,
      emailInvites,
      workspace: workspaceSummary,
    });

    if (invitation) {
      invitations.push(invitation);
    }
  }

  return invitations.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;

    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return a.workspace.name?.localeCompare(b.workspace.name ?? '') ?? 0;
    }

    return bTime - aTime;
  });
}
