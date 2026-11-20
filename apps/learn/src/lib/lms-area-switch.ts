import 'server-only';
import { hasLmsStaffAreaAccess } from '@tuturuuu/education-core/education/lms-staff-access';
import {
  lmsAreaWorkspaceOrder,
  resolveLmsAreaSwitchHref,
} from '@tuturuuu/education-core/tulearn/lms-area-switch';
import { resolveSatellitePageActor } from '@tuturuuu/satellite/workspace-access';

export async function resolveLearnAreaSwitchHref({
  currentWsId,
  locale,
  workspaceIds,
}: {
  currentWsId: string;
  locale: string;
  workspaceIds: readonly string[];
}): Promise<string | null> {
  const actor = await resolveSatellitePageActor('learn');
  if (!actor) return null;

  return resolveLmsAreaSwitchHref({
    current: 'learn',
    hasOtherAreaAccess: (wsId) =>
      hasLmsStaffAreaAccess({
        supabase: actor.admin,
        user: actor.user,
        wsId,
      }),
    locale,
    workspaceIds: lmsAreaWorkspaceOrder(currentWsId, workspaceIds),
  });
}
