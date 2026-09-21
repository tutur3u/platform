import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const PROFILE_ACTIVITY_VISIBILITY = 'PROFILE_ACTIVITY_VISIBILITY';
export class ProfileActivityUnavailable extends Error {}

export async function getActivitySharing(
  admin: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data, error } = await admin
    .from('user_workspace_configs')
    .select('value')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .eq('id', PROFILE_ACTIVITY_VISIBILITY)
    .maybeSingle();
  if (error) throw error;
  return data?.value === 'workspace';
}

// The route verifies the viewer's membership before obtaining this admin client.
// Recheck the subject's membership and consent on every read; never cache it.
export async function getSharedActivity(
  admin: TypedSupabaseClient,
  wsId: string,
  userId: string,
  timezone: string
) {
  const { data: member, error } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!member || !(await getActivitySharing(admin, wsId, userId))) {
    throw new ProfileActivityUnavailable();
  }
  const { data, error: statsError } = await admin.rpc(
    'get_time_tracker_stats',
    {
      p_user_id: userId,
      p_ws_id: wsId,
      p_is_personal: false,
      p_timezone: timezone,
      p_days_back: 90,
    }
  );
  if (statsError) throw statsError;
  // Consent or membership can change while the aggregate is being calculated.
  const { data: stillMember, error: membershipError } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!stillMember || !(await getActivitySharing(admin, wsId, userId)))
    throw new ProfileActivityUnavailable();
  const stats = data?.[0];
  return {
    today_time: stats?.today_time ?? 0,
    week_time: stats?.week_time ?? 0,
    month_time: stats?.month_time ?? 0,
    daily_activity: stats?.daily_activity ?? [],
  };
}

export async function listSharedProfiles(
  admin: TypedSupabaseClient,
  wsId: string,
  after?: string
) {
  let query = admin
    .from('user_workspace_configs')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('id', PROFILE_ACTIVITY_VISIBILITY)
    .eq('value', 'workspace')
    .order('user_id')
    .limit(51);
  if (after) query = query.gt('user_id', after);
  const { data: configs, error } = await query;
  if (error) throw error;
  const page = (configs ?? []).slice(0, 50);
  if (!page.length) return { members: [], next: null };
  const { data: members, error: memberError } = await admin
    .from('workspace_members')
    .select('user_id, users:user_id(display_name, avatar_url)')
    .eq('ws_id', wsId)
    .in(
      'user_id',
      page.map((row) => row.user_id)
    )
    .order('user_id');
  if (memberError) throw memberError;
  return {
    members: (members ?? []).map((member) => ({
      id: member.user_id,
      name: member.users?.display_name || null,
      avatar_url: member.users?.avatar_url ?? null,
    })),
    next:
      configs && configs.length > 50 ? (page.at(-1)?.user_id ?? null) : null,
  };
}
