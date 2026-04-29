import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { resolveWorkspaceBrandingUrlsForNext } from '@/lib/workspace-branding-image-url';
import { memberTypeFromInviteStatsRow } from '@/lib/workspace-invite-links';
import { enforceSeatLimit } from '@/utils/seat-limits';
import type { ValidateInviteResult, Workspace, WorkspaceInfo } from './types';

/**
 * Validates an invite code and returns information about the invite status.
 *
 * This function:
 * 1. Checks if the user is authenticated
 * 2. Verifies if the user is already a member of the workspace
 * 3. Validates the invite link via API
 * 4. Returns workspace information if valid
 *
 * @param code - The invite code to validate
 * @returns ValidateInviteResult with authentication status, membership status, workspace data, or error
 */
export async function validateInvite(
  code: string
): Promise<ValidateInviteResult> {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return {
        authenticated: false,
      };
    }

    const sbAdmin = await createAdminClient();

    // Check if user is already a member of the workspace
    const { data: inviteLink, error: inviteLinkError } = await sbAdmin
      .from('workspace_invite_links')
      .select('ws_id, workspaces:ws_id(id, name, avatar_url, logo_url)')
      .eq('code', code)
      .single();

    // If there's an error fetching the invite link, it might be invalid
    if (inviteLinkError) {
      return {
        authenticated: true,
        error: 'Invite link not found or invalid',
        errorCode: 'INVITE_INVALID_OR_EXPIRED',
      };
    }

    // Validate workspace data structure
    if (!inviteLink?.workspaces) {
      return {
        authenticated: true,
        error: 'Invalid workspace data',
        errorCode: 'INVITE_INVALID_WORKSPACE',
      };
    }

    // Type guard: ensure workspaces is an object with required fields
    const workspaceData = Array.isArray(inviteLink.workspaces)
      ? inviteLink.workspaces[0]
      : inviteLink.workspaces;

    if (
      !workspaceData ||
      typeof workspaceData !== 'object' ||
      !('id' in workspaceData) ||
      !('name' in workspaceData)
    ) {
      return {
        authenticated: true,
        error: 'Invalid workspace structure',
        errorCode: 'INVITE_INVALID_WORKSPACE',
      };
    }

    const branding = await resolveWorkspaceBrandingUrlsForNext(sbAdmin, {
      logo_url: workspaceData.logo_url,
      avatar_url: workspaceData.avatar_url,
    });

    // Cast to Workspace after validation (image fields are URLs safe for next/image)
    const workspace: Workspace = {
      id: workspaceData.id,
      name: workspaceData.name,
      avatar_url: branding.avatar_url ?? undefined,
      logo_url: branding.logo_url ?? undefined,
    };

    // Block invites to personal workspaces
    const { data: wsPersonalCheck } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', inviteLink.ws_id)
      .single();

    if (wsPersonalCheck?.personal) {
      return {
        authenticated: true,
        error: 'This workspace does not accept new members.',
        errorCode: 'INVITE_PERSONAL_WORKSPACE',
      };
    }

    const existingMember = await verifyWorkspaceMembershipType({
      wsId: inviteLink.ws_id as string,
      userId: user.id,
      supabase: sbAdmin,
      requiredType: 'MEMBER',
    });

    if (existingMember.error === 'membership_lookup_failed') {
      return {
        authenticated: true,
        error: 'Unable to verify workspace membership.',
        errorCode: 'INTERNAL_ERROR',
      };
    }

    if (existingMember.ok) {
      return {
        authenticated: true,
        alreadyMember: true,
        workspace,
      };
    }

    const { data: inviteStats, error: inviteStatsError } = await sbAdmin
      .from('workspace_invite_links_with_stats')
      .select('is_expired, is_full, member_type')
      .eq('code', code)
      .maybeSingle();

    if (inviteStatsError || !inviteStats) {
      return {
        authenticated: true,
        error: 'This invite link is invalid or has expired.',
        errorCode: 'INVITE_INVALID_OR_EXPIRED',
      };
    }

    if (inviteStats.is_expired) {
      return {
        authenticated: true,
        error: 'This invite link has expired.',
        errorCode: 'INVITE_EXPIRED',
      };
    }

    if (inviteStats.is_full) {
      return {
        authenticated: true,
        error: 'This invite link has reached its maximum number of uses.',
        errorCode: 'INVITE_MAX_USES_REACHED',
      };
    }

    const seatCheck = await enforceSeatLimit(sbAdmin, inviteLink.ws_id);

    if (!seatCheck.status) {
      return {
        authenticated: true,
        error: 'Failed to load workspace information',
        errorCode: 'INTERNAL_ERROR',
      };
    }

    const workspaceInfo: WorkspaceInfo = {
      workspace,
      memberCount: seatCheck.status.memberCount,
      seatLimitReached: !seatCheck.allowed,
      memberType: memberTypeFromInviteStatsRow(
        inviteStats as unknown as Record<string, unknown>
      ),
      seatStatus: {
        currentSeats: seatCheck.status.memberCount,
        maxSeats: seatCheck.status.isSeatBased
          ? seatCheck.status.seatCount
          : null,
        availableSeats: seatCheck.status.isSeatBased
          ? seatCheck.status.availableSeats
          : null,
        hasLimit: seatCheck.status.isSeatBased,
      },
    };

    return {
      authenticated: true,
      alreadyMember: false,
      workspaceInfo,
    };
  } catch (error) {
    console.error('Unexpected error in validateInvite:', error);
    return {
      authenticated: true,
      error: 'An unexpected error occurred',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}
