import {
  enforceRootWorkspaceAdmin,
  WorkspaceRedirectRequiredError,
} from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';

function getRedirectTarget(error: unknown): string | null {
  if (error instanceof WorkspaceRedirectRequiredError) {
    return error.redirectTo;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'WorkspaceRedirectRequiredError' &&
    'redirectTo' in error &&
    typeof error.redirectTo === 'string'
  ) {
    return error.redirectTo;
  }

  return null;
}

export async function enforceInfrastructureRootWorkspace(wsId: string) {
  try {
    await enforceRootWorkspaceAdmin(wsId, {
      redirectTo: `/${wsId}/settings`,
    });
  } catch (error) {
    const redirectTo = getRedirectTarget(error);
    if (redirectTo) {
      redirect(redirectTo);
      return;
    }

    throw error;
  }
}
