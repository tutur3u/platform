import { updateUserWorkspaceConfig } from '@tuturuuu/internal-api';
import { pastCollapseChoice, PAST_COLLAPSE_CONFIG } from './preference';
import type { PastCollapseChoice } from './types';

/** The authenticated API actor and canonical workspace scope the saved choice. */
export async function savePastCollapseChoice(
  workspaceId: string,
  choice: PastCollapseChoice
) {
  return updateUserWorkspaceConfig(
    workspaceId,
    PAST_COLLAPSE_CONFIG,
    pastCollapseChoice(choice)
  );
}
