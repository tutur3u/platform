import 'server-only';
import { hasLmsStaffAreaAccess } from '@tuturuuu/education-core/education/lms-staff-access';
import {
  lmsAreaWorkspaceOrder,
  resolveLmsAreaSwitchHref,
} from '@tuturuuu/education-core/tulearn/lms-area-switch';
import { resolveSatellitePageActor } from '@tuturuuu/satellite/workspace-access';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

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
  const supabase = (await createClient()) as TypedSupabaseClient;

  return resolveLmsAreaSwitchHref({
    current: 'learn',
    hasOtherAreaAccess: (wsId) =>
      hasLmsStaffAreaAccess({ supabase, user: actor.user, wsId }),
    locale,
    workspaceIds: lmsAreaWorkspaceOrder(currentWsId, workspaceIds),
  });
}
