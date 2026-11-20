import 'server-only';
import { hasLmsLearningAreaAccess } from '@tuturuuu/education-core/tulearn/lms-area-access';
import {
  lmsAreaWorkspaceOrder,
  resolveLmsAreaSwitchHref,
} from '@tuturuuu/education-core/tulearn/lms-area-switch';
import { resolveSatellitePageActor } from '@tuturuuu/satellite/workspace-access';

export async function resolveTeachAreaSwitchHref({
  currentWsId,
  locale,
  workspaceIds,
}: {
  currentWsId: string;
  locale: string;
  workspaceIds: readonly string[];
}): Promise<string | null> {
  const actor = await resolveSatellitePageActor('teach');
  if (!actor) return null;

  return resolveLmsAreaSwitchHref({
    current: 'teach',
    hasOtherAreaAccess: (wsId) =>
      hasLmsLearningAreaAccess({
        supabase: actor.admin,
        user: actor.user,
        wsId,
      }),
    locale,
    workspaceIds: lmsAreaWorkspaceOrder(currentWsId, workspaceIds),
  });
}
