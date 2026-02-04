import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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
    if (!inviteLink || !inviteLink.workspaces) {
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

    // Cast to Workspace after validation
    const workspace: Workspace = {
      id: workspaceData.id,
      name: workspaceData.name,
      avatar_url: workspaceData.avatar_url,
      logo_url: workspaceData.logo_url,
    };

    // Check if user is already a member
    const { data: existingMember } = await sbAdmin
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', inviteLink.ws_id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return {
        authenticated: true,
        alreadyMember: true,
        workspace,
      };
    }

    // Validate invite link via API with error handling
    const baseUrl = DEV_MODE ? 'http://localhost:7803' : 'https://tuturuuu.com';

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/invite/${code}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
    } catch (fetchError) {
      console.error('Network error validating invite:', fetchError);
      return {
        authenticated: true,
        error: 'Network error. Please check your connection and try again.',
        errorCode: 'NETWORK_ERROR',
      };
    }

    if (!response.ok) {
      let errorData: { error?: string; errorCode?: string } = {};
      try {
        errorData = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse error response:', jsonError);
        return {
          authenticated: true,
          error: 'Failed to validate invite link',
          errorCode: 'INTERNAL_ERROR',
        };
      }

      return {
        authenticated: true,
        error: errorData.error || 'This invite link is invalid or has expired.',
        errorCode: errorData.errorCode || 'INVITE_INVALID_OR_EXPIRED',
      };
    }

    // Parse workspace info with error handling
    let apiResponse: {
      workspace: WorkspaceInfo['workspace'];
      memberCount: number;
      seatLimitReached?: boolean;
      seatStatus?: WorkspaceInfo['seatStatus'];
    };
    try {
      apiResponse = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse workspace info:', jsonError);
      return {
        authenticated: true,
        error: 'Failed to load workspace information',
        errorCode: 'INTERNAL_ERROR',
      };
    }

    // Validate workspaceInfo structure
    if (
      !apiResponse ||
      !apiResponse.workspace ||
      !apiResponse.workspace.id ||
      !apiResponse.workspace.name
    ) {
      return {
        authenticated: true,
        error: 'Invalid workspace information received',
        errorCode: 'INTERNAL_ERROR',
      };
    }

    // Build WorkspaceInfo including seat status
    const workspaceInfo: WorkspaceInfo = {
      workspace: apiResponse.workspace,
      memberCount: apiResponse.memberCount,
      seatLimitReached: apiResponse.seatLimitReached,
      seatStatus: apiResponse.seatStatus,
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
