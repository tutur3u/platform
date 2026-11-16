import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
} from '@tuturuuu/utils/constants';
import {
  enforceRootWorkspaceAdmin,
  WorkspaceRedirectRequiredError,
} from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

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
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    redirect(`/${INTERNAL_WORKSPACE_SLUG}`);
    return;
  }

  try {
    // Any redirect target marks a denied member; infra has no fallback page.
    await enforceRootWorkspaceAdmin(wsId, { redirectTo: `/${wsId}` });
  } catch (error) {
    if (getRedirectTarget(error)) notFound();
    throw error;
  }
}
