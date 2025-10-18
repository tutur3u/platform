import { MAX_WORKSPACES_FOR_FREE_USERS } from './constants';
import { isValidTuturuuuEmail } from './email/client';

export const WORKSPACE_LIMIT_ERROR_CODE = 'WORKSPACE_LIMIT_REACHED';

export interface WorkspaceLimitCheckResult {
  canCreate: boolean;
  currentCount?: number;
  limit?: number;
  errorMessage?: string;
  errorCode?: string;
}

/**
 * Check if a user can create a new workspace based on their email and current workspace count
 * @param supabase - Supabase client instance
 * @param userId - User ID to check
 * @param userEmail - User email (null/undefined for unlimited)
 * @returns Result indicating whether the user can create a workspace
 */
export async function checkWorkspaceCreationLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  userEmail: string | null | undefined
): Promise<WorkspaceLimitCheckResult> {
  // Tuturuuu emails have unlimited workspace creation
  if (isValidTuturuuuEmail(userEmail)) {
    return {
      canCreate: true,
    };
  }

  // Count non-deleted workspaces created by this user
  const { count, error: countError } = await supabase
    .from('workspaces')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', userId)
    .eq('deleted', false);

  if (countError) {
    console.error('Error counting workspaces:', countError);
    return {
      canCreate: false,
      errorMessage: 'Error checking workspace limit',
      errorCode: 'WORKSPACE_COUNT_ERROR',
    };
  }

  const currentCount = count ?? 0;

  // Check if user has reached the limit
  if (currentCount >= MAX_WORKSPACES_FOR_FREE_USERS) {
    return {
      canCreate: false,
      currentCount,
      limit: MAX_WORKSPACES_FOR_FREE_USERS,
      errorMessage: `You have reached the maximum limit of ${MAX_WORKSPACES_FOR_FREE_USERS} workspaces. Please upgrade to a paid plan or contact the Tuturuuu team for more information.`,
      errorCode: WORKSPACE_LIMIT_ERROR_CODE,
    };
  }

  return {
    canCreate: true,
    currentCount,
    limit: MAX_WORKSPACES_FOR_FREE_USERS,
  };
}
