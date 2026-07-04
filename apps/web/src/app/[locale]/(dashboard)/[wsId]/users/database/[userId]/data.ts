import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { notFound } from 'next/navigation';
import { fetchRequireAttentionUserIds } from '@/lib/require-attention-users';
import { listUserGroupSessionDatesByGroupIds } from '@/lib/user-groups/session-schedule';
import { listAvailableReferralUsers } from '@/lib/user-referrals';
import type {
  LinkedPromotionItem,
  SentEmail,
  UserDetail,
  UserGroupMembership,
  UserReport,
  WorkspaceSettings,
} from './types';

type RequireAttentionOptions = Parameters<
  typeof fetchRequireAttentionUserIds
>[1];

async function fetchRequireAttentionUserIdsOrEmpty(
  sbAdmin: Parameters<typeof fetchRequireAttentionUserIds>[0],
  options: RequireAttentionOptions,
  metadata: Record<string, unknown>
) {
  try {
    return await fetchRequireAttentionUserIds(sbAdmin, options);
  } catch (error) {
    console.error(
      'Failed to load user detail require-attention flags',
      metadata,
      error
    );
    return new Set<string>();
  }
}

export async function loadOptionalUserDetailResource<T>({
  fallback,
  loader,
  name,
  userId,
  wsId,
}: {
  fallback: T;
  loader: () => Promise<T>;
  name: string;
  userId: string;
  wsId: string;
}) {
  try {
    return await loader();
  } catch (error) {
    console.error(
      'Failed to load user detail resource',
      { resource: name, userId, wsId },
      error
    );
    return fallback;
  }
}

export async function isUserGuest(user_id: string) {
  const sbAdmin = await createAdminClient();

  const user_uuid = user_id;

  const { data, error } = await sbAdmin.rpc('is_user_guest', {
    user_uuid,
  });
  if (error) throw error;
  return data as boolean;
}

export async function getUserDetailData({
  wsId,
  userId,
  hasPrivateInfo,
  hasPublicInfo,
}: {
  wsId: string;
  userId: string;
  hasPrivateInfo: boolean;
  hasPublicInfo: boolean;
}) {
  const sbAdmin = await createAdminClient();

  const { data: rawData, error } = await sbAdmin.rpc(
    'get_workspace_user_with_details',
    {
      p_ws_id: wsId,
      p_user_id: userId,
    }
  );
  if (error) throw error;
  if (!rawData) notFound();

  interface RPCUserWithDetails {
    id: string;
    full_name: string | null;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
    phone: string | null;
    birthday: string | null;
    gender: string | null;
    ethnicity: string | null;
    guardian: string | null;
    national_id: string | null;
    address: string | null;
    note: string | null;
    archived: boolean | null;
    archived_until: string | null;
    created_at: string | null;
    updated_at: string | null;
    group_count: number | null;
    linked_users:
      | {
          platform_user_id: string;
          users: {
            display_name: string | null;
          } | null;
        }[]
      | null;
    referrer: {
      id: string;
      display_name: string | null;
      full_name: string | null;
    } | null;
  }

  const userWithDetails = rawData as unknown as RPCUserWithDetails;
  const requireAttentionUserIds = await fetchRequireAttentionUserIdsOrEmpty(
    sbAdmin,
    {
      wsId,
      userIds: [
        userWithDetails.id,
        ...(userWithDetails.referrer?.id ? [userWithDetails.referrer.id] : []),
      ],
    },
    {
      loader: 'getUserDetailData',
      userId,
      wsId,
    }
  );

  const data: UserDetail = {
    id: userWithDetails.id,
    full_name: userWithDetails.full_name,
    display_name: userWithDetails.display_name,
    avatar_url: normalizeAvatarImageSrc(userWithDetails.avatar_url) ?? null,
    email: userWithDetails.email,
    phone: userWithDetails.phone,
    birthday: userWithDetails.birthday,
    gender: userWithDetails.gender,
    ethnicity: userWithDetails.ethnicity,
    guardian: userWithDetails.guardian,
    national_id: userWithDetails.national_id,
    address: userWithDetails.address,
    note: userWithDetails.note,
    archived: userWithDetails.archived ?? undefined,
    archived_until: userWithDetails.archived_until,
    created_at: userWithDetails.created_at,
    updated_at: userWithDetails.updated_at,
    has_require_attention_feedback: requireAttentionUserIds.has(
      userWithDetails.id
    ),
    group_count: userWithDetails.group_count ?? undefined,
    linked_users: (userWithDetails.linked_users || [])
      .map(({ platform_user_id, users }) =>
        users
          ? {
              id: platform_user_id,
              display_name: users.display_name,
            }
          : null
      )
      .filter(
        (v): v is { id: string; display_name: string | null } =>
          v !== null && v !== undefined
      ),
    referrer: userWithDetails.referrer
      ? {
          id: userWithDetails.referrer.id,
          display_name:
            userWithDetails.referrer.display_name ||
            userWithDetails.referrer.full_name ||
            '',
          has_require_attention_feedback: requireAttentionUserIds.has(
            userWithDetails.referrer.id
          ),
        }
      : undefined,
  };

  const sanitized: Partial<UserDetail> & {
    id: string;
    group_count?: number;
    updated_at?: string | null;
  } = {
    ...data,
  };

  if (!hasPrivateInfo) {
    delete sanitized.email;
    delete sanitized.phone;
    delete sanitized.birthday;
    delete sanitized.gender;
    delete sanitized.ethnicity;
    delete sanitized.guardian;
    delete sanitized.national_id;
    delete sanitized.address;
    delete sanitized.note;
  }

  if (!hasPublicInfo) {
    delete sanitized.avatar_url;
    delete sanitized.full_name;
    delete sanitized.display_name;
    delete sanitized.group_count;
    delete sanitized.linked_users;
    delete sanitized.created_at;
    delete sanitized.updated_at;
  }

  return sanitized as UserDetail;
}

export async function getGroupData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();

  const { data, count, error } = await sbAdmin
    .from('workspace_user_groups')
    .select(
      'id, name, starting_date, ending_date, workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, role)',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .eq('workspace_user_groups_users.user_id', userId)
    .order('name', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as UserGroupMembership[];
  const sessionsByGroupId = await listUserGroupSessionDatesByGroupIds({
    groupIds: rows.map((group) => group.id),
    supabase: sbAdmin,
    wsId,
  });

  return {
    data: rows.map((group) => ({
      ...group,
      sessions: sessionsByGroupId.get(group.id) ?? [],
    })),
    count: count ?? 0,
  };
}

export async function getReportData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const {
    data: rawData,
    count,
    error,
  } = await privateDb
    .from('external_user_monthly_reports_workspace_view')
    .select('*', {
      count: 'exact',
    })
    .eq('user_id', userId)
    .eq('user_ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const data = (rawData || []).map((rowData) => {
    const {
      creator_display_name: _creatorDisplayName,
      creator_email: _creatorEmail,
      creator_full_name: _creatorFullName,
      group_name: _groupName,
      group_ws_id: _groupWsId,
      modifier_display_name: _modifierDisplayName,
      modifier_email: _modifierEmail,
      modifier_full_name: _modifierFullName,
      user_archived: _userArchived,
      user_archived_until: _userArchivedUntil,
      user_display_name: _userDisplayName,
      user_email: _userEmail,
      user_full_name: _userFullName,
      user_note: _userNote,
      user_ws_id: _userWsId,
      ...rest
    } = rowData;
    return rest as UserReport;
  });

  return { data, count: count ?? 0 };
}

export async function getCouponData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const { data: links, error: linksError } = await privateDb
    .from('user_linked_promotions')
    .select('promo_id')
    .eq('user_id', userId);

  if (linksError) {
    console.error(
      'Error fetching user detail coupon links',
      { userId, wsId },
      linksError
    );
    return { data: [], count: 0 };
  }

  const promoIds = [...new Set((links ?? []).map((link) => link.promo_id))];

  if (promoIds.length === 0) {
    return { data: [], count: 0 };
  }

  const { data, error } = await privateDb
    .from('workspace_promotions')
    .select('id, name, description, code, value, use_ratio')
    .eq('ws_id', wsId)
    .in('id', promoIds);

  if (error) {
    console.error(
      'Error fetching user detail coupon data',
      { promoCount: promoIds.length, userId, wsId },
      error
    );
    return { data: [], count: 0 };
  }

  return {
    data: (data ?? []) as unknown as LinkedPromotionItem[],
    count: data?.length ?? 0,
  };
}

export async function getWorkspaceSettings(
  wsId: string
): Promise<WorkspaceSettings> {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('workspace_settings')
    .select(
      'referral_count_cap, referral_increment_percent, referral_reward_type, referral_promotion_id'
    )
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as WorkspaceSettings;
}

export async function getAvailableUsersForReferral({
  wsId,
  currentUserId,
}: {
  wsId: string;
  currentUserId: string;
}) {
  const sbAdmin = await createAdminClient();
  const availableUsers = await listAvailableReferralUsers(sbAdmin, {
    wsId,
    currentUserId,
  });

  return {
    data: availableUsers,
    count: availableUsers.length,
  };
}

export async function getReferredUsers({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id, full_name, display_name, email, phone')
    .eq('ws_id', wsId)
    .eq('referred_by', userId)
    .eq('archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const referredUsers = (data || []) as unknown as WorkspaceUser[];
  const requireAttentionUserIds = await fetchRequireAttentionUserIdsOrEmpty(
    sbAdmin,
    {
      wsId,
      userIds: referredUsers.map((user) => user.id),
    },
    {
      loader: 'getReferredUsers',
      referredUserCount: referredUsers.length,
      userId,
      wsId,
    }
  );

  return referredUsers.map((user) => ({
    ...user,
    has_require_attention_feedback: requireAttentionUserIds.has(user.id),
  }));
}

export async function getUserSentEmails({
  wsId,
  userId,
  pageSize,
}: {
  wsId: string;
  userId: string;
  pageSize: number;
}) {
  const sbAdmin = await createAdminClient();

  const { data, error, count } = await sbAdmin
    .from('sent_emails')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .limit(pageSize);
  if (error) throw error;
  return { data: (data || []) as SentEmail[], count: count || 0 };
}
