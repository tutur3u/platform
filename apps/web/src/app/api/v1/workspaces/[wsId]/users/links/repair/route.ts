import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const RepairRequestSchema = z
  .object({
    workspaceUserId: z.guid().optional(),
  })
  .default({});

type RepairSkipReason =
  | 'missing_email'
  | 'no_member_match'
  | 'ambiguous_workspace_profile'
  | 'ambiguous_platform_match'
  | 'already_linked'
  | 'platform_already_linked';

interface WorkspaceUserCandidate {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  ws_id: string;
}

interface WorkspaceUserLink {
  platform_user_id: string;
  virtual_user_id: string;
  ws_id: string;
}

interface WorkspaceMemberRow {
  user_id: string;
}

interface UserPrivateDetailsRow {
  user_id: string;
  email: string | null;
}

interface RepairedLink {
  email: string;
  platformUserId: string;
  workspaceUserId: string;
  workspaceUserName: string | null;
}

interface SkippedRepair {
  detail?: string;
  email: string | null;
  reason: RepairSkipReason;
  workspaceUserId: string;
  workspaceUserName: string | null;
}

function normalizeRepairEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function getWorkspaceUserName(user: WorkspaceUserCandidate) {
  return user.full_name || user.display_name || null;
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function createSkippedRepair(
  user: WorkspaceUserCandidate,
  reason: RepairSkipReason,
  detail?: string
): SkippedRepair {
  return {
    detail,
    email: normalizeRepairEmail(user.email),
    reason,
    workspaceUserId: user.id,
    workspaceUserName: getWorkspaceUserName(user),
  };
}

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const body = await request.json().catch(() => ({}));
    const parsedBody = RepairRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }

    const { containsPermission } = permissions;
    if (
      !containsPermission('update_users') ||
      !containsPermission('view_users_private_info')
    ) {
      return NextResponse.json(
        { message: 'Insufficient permissions to repair platform user links' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { workspaceUserId } = parsedBody.data;

    const [workspaceUsersResult, existingLinksResult, workspaceMembersResult] =
      await Promise.all([
        sbAdmin
          .from('workspace_users')
          .select('id,email,display_name,full_name,ws_id')
          .eq('ws_id', wsId)
          .order('id', { ascending: true }),
        sbAdmin
          .from('workspace_user_linked_users')
          .select('platform_user_id,virtual_user_id,ws_id')
          .eq('ws_id', wsId)
          .order('created_at', { ascending: true }),
        sbAdmin
          .from('workspace_members')
          .select('user_id')
          .eq('ws_id', wsId)
          .order('user_id', { ascending: true }),
      ]);

    if (workspaceUsersResult.error) {
      serverLogger.error('Failed to load workspace users for link repair', {
        error: workspaceUsersResult.error,
        wsId,
      });
      return NextResponse.json(
        { message: 'Error loading workspace users' },
        { status: 500 }
      );
    }

    if (existingLinksResult.error) {
      serverLogger.error('Failed to load workspace user links for repair', {
        error: existingLinksResult.error,
        wsId,
      });
      return NextResponse.json(
        { message: 'Error loading workspace user links' },
        { status: 500 }
      );
    }

    if (workspaceMembersResult.error) {
      serverLogger.error('Failed to load workspace members for link repair', {
        error: workspaceMembersResult.error,
        wsId,
      });
      return NextResponse.json(
        { message: 'Error loading workspace members' },
        { status: 500 }
      );
    }

    const workspaceUsers =
      (workspaceUsersResult.data as WorkspaceUserCandidate[] | null) ?? [];
    const existingLinks =
      (existingLinksResult.data as WorkspaceUserLink[] | null) ?? [];
    const workspaceMembers =
      (workspaceMembersResult.data as WorkspaceMemberRow[] | null) ?? [];

    const targetUsers = workspaceUserId
      ? workspaceUsers.filter((user) => user.id === workspaceUserId)
      : workspaceUsers;

    if (workspaceUserId && targetUsers.length === 0) {
      return NextResponse.json(
        { message: 'Workspace user not found' },
        { status: 404 }
      );
    }

    const memberIds = [
      ...new Set(
        workspaceMembers
          .map((member) => member.user_id)
          .filter((userId): userId is string => Boolean(userId))
      ),
    ];

    const userPrivateDetails: UserPrivateDetailsRow[] = [];
    for (const memberIdChunk of chunkArray(memberIds, 500)) {
      const { data, error } = await sbAdmin
        .from('user_private_details')
        .select('user_id,email')
        .in('user_id', memberIdChunk);

      if (error) {
        serverLogger.error(
          'Failed to load member private details for link repair',
          {
            error,
            wsId,
          }
        );
        return NextResponse.json(
          { message: 'Error loading workspace member details' },
          { status: 500 }
        );
      }

      userPrivateDetails.push(
        ...((data as UserPrivateDetailsRow[] | null) ?? [])
      );
    }

    const linksByVirtualUserId = new Map(
      existingLinks.map((link) => [link.virtual_user_id, link])
    );
    const linksByPlatformUserId = new Map(
      existingLinks.map((link) => [link.platform_user_id, link])
    );
    const unlinkedWorkspaceUsers = workspaceUsers.filter(
      (user) => !linksByVirtualUserId.has(user.id)
    );
    const unlinkedUsersByEmail = new Map<string, WorkspaceUserCandidate[]>();

    for (const user of unlinkedWorkspaceUsers) {
      const normalizedEmail = normalizeRepairEmail(user.email);
      if (!normalizedEmail) continue;

      const users = unlinkedUsersByEmail.get(normalizedEmail) ?? [];
      users.push(user);
      unlinkedUsersByEmail.set(normalizedEmail, users);
    }

    const memberIdsByEmail = new Map<string, string[]>();
    const workspaceMemberIdSet = new Set(memberIds);

    for (const details of userPrivateDetails) {
      if (!workspaceMemberIdSet.has(details.user_id)) continue;

      const normalizedEmail = normalizeRepairEmail(details.email);
      if (!normalizedEmail) continue;

      const users = memberIdsByEmail.get(normalizedEmail) ?? [];
      users.push(details.user_id);
      memberIdsByEmail.set(normalizedEmail, users);
    }

    const linked: RepairedLink[] = [];
    const skipped: SkippedRepair[] = [];
    const linkRowsToInsert: WorkspaceUserLink[] = [];
    const repairCandidates = workspaceUserId
      ? targetUsers
      : targetUsers.filter((user) => !linksByVirtualUserId.has(user.id));

    for (const user of repairCandidates) {
      const normalizedEmail = normalizeRepairEmail(user.email);

      if (!normalizedEmail) {
        skipped.push(createSkippedRepair(user, 'missing_email'));
        continue;
      }

      if (linksByVirtualUserId.has(user.id)) {
        skipped.push(createSkippedRepair(user, 'already_linked'));
        continue;
      }

      const matchingWorkspaceUsers =
        unlinkedUsersByEmail.get(normalizedEmail) ?? [];
      if (matchingWorkspaceUsers.length !== 1) {
        skipped.push(
          createSkippedRepair(
            user,
            'ambiguous_workspace_profile',
            String(matchingWorkspaceUsers.length)
          )
        );
        continue;
      }

      const matchingPlatformUserIds =
        memberIdsByEmail.get(normalizedEmail) ?? [];
      if (matchingPlatformUserIds.length === 0) {
        skipped.push(createSkippedRepair(user, 'no_member_match'));
        continue;
      }

      if (matchingPlatformUserIds.length > 1) {
        skipped.push(
          createSkippedRepair(
            user,
            'ambiguous_platform_match',
            String(matchingPlatformUserIds.length)
          )
        );
        continue;
      }

      const platformUserId = matchingPlatformUserIds[0];
      if (!platformUserId) {
        skipped.push(createSkippedRepair(user, 'no_member_match'));
        continue;
      }

      if (linksByPlatformUserId.has(platformUserId)) {
        skipped.push(createSkippedRepair(user, 'platform_already_linked'));
        continue;
      }

      const linkRow = {
        platform_user_id: platformUserId,
        virtual_user_id: user.id,
        ws_id: wsId,
      };
      linkRowsToInsert.push(linkRow);
      linksByVirtualUserId.set(user.id, linkRow);
      linksByPlatformUserId.set(platformUserId, linkRow);
      linked.push({
        email: normalizedEmail,
        platformUserId,
        workspaceUserId: user.id,
        workspaceUserName: getWorkspaceUserName(user),
      });
    }

    if (linkRowsToInsert.length > 0) {
      const { error } = await sbAdmin
        .from('workspace_user_linked_users')
        .insert(linkRowsToInsert);

      if (error) {
        serverLogger.error('Failed to insert repaired workspace user links', {
          error,
          wsId,
        });
        return NextResponse.json(
          { message: 'Error repairing workspace user links' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      linked,
      skipped,
      summary: {
        linked: linked.length,
        scanned: repairCandidates.length,
        skipped: skipped.length,
      },
    });
  } catch (error) {
    serverLogger.error('Unexpected workspace user link repair error', {
      error,
    });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
