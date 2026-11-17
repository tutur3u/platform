import { fetchWorkspaceSummaries } from '@tuturuuu/ui/lib/workspace-actions';
import type { CurrentUserReadContext, SectionOutcome } from './context';

type SummaryOptions = Omit<
  Parameters<typeof fetchWorkspaceSummaries>[0],
  'requireAuth' | 'supabase' | 'userId'
>;

/**
 * Body of `GET /api/v1/workspaces`: member workspaces of the caller only.
 * `options` carries the route's optional `q`/`limit`/`request`.
 */
export async function readWorkspaceSummaries(
  ctx: Omit<CurrentUserReadContext, 'db'>,
  options: SummaryOptions = {}
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  try {
    return {
      body: await fetchWorkspaceSummaries({
        ...options,
        requireAuth: true,
        supabase,
        userId: user.id,
      }),
      status: 200,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'WORKSPACE_SUMMARY_UNAUTHORIZED'
    ) {
      return { body: { error: 'Unauthorized' }, status: 401 };
    }
    return {
      body: { error: 'Internal server error' },
      log: ['Error in workspaces API:', error],
      status: 500,
    };
  }
}
