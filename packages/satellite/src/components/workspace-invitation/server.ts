import {
  getWorkspaceInviteStatus,
  InternalApiError,
  listWorkspaceInvitations,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';

type HeaderAccessor = Pick<Headers, 'get'>;

export async function getPendingWorkspaceInvitation(
  workspaceId: string,
  requestHeaders: HeaderAccessor
) {
  try {
    const status = await getWorkspaceInviteStatus(
      workspaceId,
      withForwardedInternalApiAuth(requestHeaders)
    );

    return status.status === 'pending_invite' ? status.invitation : null;
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      return null;
    }

    throw error;
  }
}

export async function getPendingWorkspaceInvitations(
  requestHeaders: HeaderAccessor
) {
  try {
    const response = await listWorkspaceInvitations(
      withForwardedInternalApiAuth(requestHeaders)
    );

    return response.invitations;
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return [];
    }

    throw error;
  }
}
