import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import { workspaceTierRank } from './feature-tier-policy';

export class MeetDurationError extends Error {
  readonly status = 503;
}

export function meetingDurationSeconds(tier: string) {
  return (
    (tier === 'PLUS'
      ? 10
      : workspaceTierRank(tier) >= workspaceTierRank('PRO')
        ? 24
        : 2) * 3600
  );
}

/** Entitlements belong to the host's personal account, never the joining guest. */
export async function getHostMeetingTier(
  hostId: string
): Promise<WorkspaceProductTier> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspaces')
    .select('id')
    .eq('creator_id', hostId)
    .eq('personal', true)
    .or('deleted.is.null,deleted.eq.false')
    .maybeSingle();
  if (error) throw new MeetDurationError('Meeting entitlement lookup failed');
  if (!data) return 'FREE';
  const { data: tier, error: tierError } = await db.rpc(
    '_resolve_workspace_tier',
    { p_ws_id: data.id }
  );
  if (tierError || !tier)
    throw new MeetDurationError('Meeting entitlement lookup failed');
  return tier;
}

export async function getHostMeetingDurationSeconds(hostId: string) {
  return meetingDurationSeconds(await getHostMeetingTier(hostId));
}
