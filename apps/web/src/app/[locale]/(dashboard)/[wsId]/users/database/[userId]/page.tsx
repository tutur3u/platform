import { Users } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { InvoiceUserHistoryAccordion } from '@tuturuuu/ui/finance/invoices/components/invoice-user-history-accordion';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import moment from 'moment';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import { fetchRequireAttentionUserIds } from '@/lib/require-attention-users';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import EditUserDialog from './edit-user-dialog';
import LinkedPromotionsClient from './linked-promotions-client';
import ReferralSectionClient from './referral-section-client';
import SentEmailsClient from './sent-emails-client';

export const metadata: Metadata = {
  title: 'Userid Details',
  description:
    'Manage Userid Details in the Database area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

const EMAIL_PAGE_SIZE = 10;

export default async function WorkspaceUserDetailsPage({ params }: Props) {
  const t = await getTranslations('user-data-table');
  const { wsId: id, userId } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  const hasPrivateInfo = containsPermission('view_users_private_info');
  const hasPublicInfo = containsPermission('view_users_public_info');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canUpdateUsers = containsPermission('update_users');

  // User must have at least one permission to view user details
  if (!hasPrivateInfo && !hasPublicInfo) {
    notFound();
  }

  const data = (await getData({
    wsId,
    userId,
    hasPrivateInfo,
    hasPublicInfo,
  })) as WorkspaceUser & {
    referrer?: {
      id: string;
      display_name: string | null;
      has_require_attention_feedback?: boolean;
    };
  };

  const isGuest = await isUserGuest(userId);

  const { data: groups, count: groupCount } = await getGroupData({
    wsId,
    userId,
  });

  const { data: reports, count: reportCount } = await getReportData({
    wsId,
    userId,
  });

  const { data: coupons, count: couponCount } = await getCouponData({
    wsId,
    userId,
  });

  const { data: sentEmails, count: sentEmailCount } = await getUserSentEmails({
    wsId,
    userId,
    pageSize: EMAIL_PAGE_SIZE,
  });

  // Fetch referral data
  const workspaceSettings = await getWorkspaceSettings(wsId);
  const { data: availableUsers, count: availableUsersCount } =
    await getAvailableUsersForReferral({
      wsId,
      currentUserId: userId,
    });

  const referredUsers = await getReferredUsers({ wsId, userId });

  return (
    <div className="flex min-h-full w-full flex-col">
      {hasPublicInfo && data.avatar_url && (
        <div className="mb-2 flex flex-col items-center justify-center gap-2 font-semibold text-lg">
          <Image
            width={128}
            height={128}
            src={data.avatar_url}
            alt="Avatar"
            className="aspect-square min-w-32 rounded-lg object-cover"
          />
          {data.full_name && (
            <div>
              <RequireAttentionName
                name={data.full_name}
                requireAttention={!!data.has_require_attention_feedback}
              />
            </div>
          )}
          {isGuest && (
            <div className="inline-flex items-center rounded-full border border-dynamic-orange/20 bg-dynamic-orange/10 px-2 py-0.5 font-medium text-dynamic-orange text-sm">
              {t('guest')}
            </div>
          )}
          {data.referrer?.id && (
            <Link
              href={`/${wsId}/users/database/${data.referrer.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-dynamic-border bg-dynamic-surface/50 px-2 py-0.5 font-medium text-sm transition-colors hover:bg-dynamic-surface/80"
            >
              <span className="opacity-60">Referred by:</span>
              <RequireAttentionName
                name={data.referrer.display_name || data.full_name || '-'}
                requireAttention={
                  !!data.referrer.has_require_attention_feedback
                }
              />
            </Link>
          )}
        </div>
      )}

      {canUpdateUsers && <EditUserDialog wsId={wsId} data={data} />}

      <div className="grid h-fit gap-4 md:grid-cols-2">
        <div className="grid gap-4">
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="font-semibold text-lg">
              {t('basic_information')}
            </div>
            <Separator />
            {hasPublicInfo && data.display_name && (
              <div>
                <span className="opacity-60">{t('display_name')}:</span>{' '}
                <RequireAttentionName
                  name={data.display_name}
                  requireAttention={!!data.has_require_attention_feedback}
                />
              </div>
            )}
            {hasPrivateInfo && data.birthday && (
              <div>
                <span className="opacity-60">{t('birthday')}:</span>{' '}
                {data.birthday}
              </div>
            )}
            {hasPrivateInfo && data.email && (
              <div>
                <span className="opacity-60">{t('email')}:</span> {data.email}
              </div>
            )}
            {hasPrivateInfo && data.phone && (
              <div>
                <span className="opacity-60">{t('phone')}:</span> {data.phone}
              </div>
            )}
            {hasPrivateInfo && data.gender && (
              <div>
                <span className="opacity-60">{t('gender')}:</span> {data.gender}
              </div>
            )}
            {hasPublicInfo && data.created_at && (
              <div className="flex gap-1">
                <span className="opacity-60">{t('created_at')}:</span>{' '}
                {moment(data.created_at).format('DD/MM/YYYY, HH:mm:ss')}
              </div>
            )}
          </div>
          <SentEmailsClient
            wsId={wsId}
            userId={userId}
            initialEmails={sentEmails}
            initialCount={sentEmailCount || 0}
            pageSize={EMAIL_PAGE_SIZE}
          />

          {canCheckUserAttendance && (
            <UserMonthAttendance
              wsId={wsId}
              user={{
                ...data,
                id: data.id,
                full_name: data.display_name || data.full_name || null,
                href: `/${wsId}/users/database/${data.id}`,
                archived: data.archived ?? undefined,
                archived_until: data.archived_until ?? null,
                isGuest,
              }}
            />
          )}
        </div>

        <div className="grid gap-4">
          {hasPrivateInfo && (
            <div className="h-full rounded-lg border p-4">
              <div
                className={`h-full gap-2 ${groups?.length ? 'grid content-start' : 'flex flex-col items-center justify-center'}`}
              >
                <div className="font-semibold text-lg">
                  {t('joined_groups')} ({groupCount})
                </div>
                <Separator />
                {groups?.length ? (
                  <div className="grid h-full gap-2 2xl:grid-cols-2">
                    {groups.map((group) => {
                      const isManager =
                        group.workspace_user_groups_users?.[0]?.role ===
                        'TEACHER';
                      return (
                        <Link
                          key={group.id}
                          href={`/${wsId}/users/groups/${group.id}`}
                        >
                          <Button
                            className="flex w-full items-center gap-2"
                            variant="secondary"
                          >
                            <Users className="inline-block h-6 w-6" />
                            {group.name}
                            {isManager && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                              >
                                {t('manager')}
                              </Badge>
                            )}
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex w-full flex-1 items-center justify-center text-center opacity-60">
                    {t('no_groups')}.
                  </div>
                )}
              </div>
            </div>
          )}

          {hasPrivateInfo && (
            <div className="h-full rounded-lg border p-4">
              <div
                className={`h-full gap-2 ${reports?.length ? 'grid content-start' : 'flex flex-col items-center justify-center'}`}
              >
                <div className="font-semibold text-lg">
                  {t('reports')} ({reportCount})
                </div>
                <Separator />
                {reports?.length ? (
                  <div className="grid h-full gap-2 2xl:grid-cols-2">
                    {reports.map((group) => (
                      <Link
                        key={group.id}
                        href={`/${wsId}/users/reports/${group.id}`}
                      >
                        <Button
                          className="flex w-full items-center gap-2"
                          variant="secondary"
                        >
                          <Users className="inline-block h-6 w-6" />
                          {group.title}
                        </Button>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex w-full flex-1 items-center justify-center text-center opacity-60">
                    {t('no_reports')}.
                  </div>
                )}
              </div>
            </div>
          )}

          {hasPrivateInfo && (
            <LinkedPromotionsClient
              wsId={wsId}
              userId={userId}
              canUpdateUsers={canUpdateUsers}
              initialPromotions={(coupons || []).map((c: any) => ({
                id: c.id,
                name: c.name ?? null,
                description: c.description ?? null,
                code: c.code ?? null,
                value: c.value ?? null,
                use_ratio: c.use_ratio ?? null,
              }))}
              initialCount={couponCount || 0}
            />
          )}

          {hasPrivateInfo && (
            <ReferralSectionClient
              wsId={wsId}
              userId={userId}
              canUpdateUsers={canUpdateUsers}
              workspaceSettings={workspaceSettings}
              initialAvailableUsers={availableUsers}
              initialAvailableUsersCount={availableUsersCount || 0}
              initialReferredUsers={referredUsers}
            />
          )}
        </div>
      </div>

      {hasPrivateInfo && (
        <InvoiceUserHistoryAccordion wsId={wsId} userId={userId} />
      )}
    </div>
  );
}

async function isUserGuest(user_id: string) {
  const sbAdmin = await createAdminClient();

  const user_uuid = user_id;

  const { data, error } = await sbAdmin.rpc('is_user_guest', {
    user_uuid,
  });
  if (error) throw error;
  return data as boolean;
}

async function getData({
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

  // Use raw SQL query via RPC to avoid complex PostgREST syntax
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
  const requireAttentionUserIds = await fetchRequireAttentionUserIds(sbAdmin, {
    wsId,
    userIds: [
      userWithDetails.id,
      ...(userWithDetails.referrer?.id ? [userWithDetails.referrer.id] : []),
    ],
  });

  const data: WorkspaceUser & {
    referrer?: {
      id: string;
      display_name: string | null;
      has_require_attention_feedback?: boolean;
    };
    updated_at?: string | null;
    group_count?: number;
    linked_users: { id: string; display_name: string | null }[];
  } = {
    id: userWithDetails.id,
    full_name: userWithDetails.full_name,
    display_name: userWithDetails.display_name,
    avatar_url: userWithDetails.avatar_url,
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

  // Sanitize data based on permissions
  const sanitized: Partial<typeof data> & {
    id: string;
    group_count?: number;
    updated_at?: string | null;
  } = {
    ...data,
  };

  // Remove private fields if user doesn't have permission
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

  // Remove public fields if user doesn't have permission
  if (!hasPublicInfo) {
    delete sanitized.avatar_url;
    delete sanitized.full_name;
    delete sanitized.display_name;
    delete sanitized.group_count;
    delete sanitized.linked_users;
    delete sanitized.created_at;
    delete sanitized.updated_at;
  }

  return sanitized;
}

async function getGroupData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
    .from('workspace_user_groups')
    .select('*, workspace_user_groups_users!inner(user_id, role)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .eq('workspace_user_groups_users.user_id', userId);

  const { data, count, error } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}

async function getReportData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
    .from('external_user_monthly_reports')
    .select('*, user:workspace_users!user_id!inner(ws_id)', {
      count: 'exact',
    })
    .eq('user_id', userId)
    .eq('user.ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data: rawData, count, error } = await queryBuilder;
  if (error) throw error;

  const data = (rawData || []).map((rowData) => {
    const { user: _, ...rest } = rowData;
    return rest as WorkspaceUserReport;
  });

  return { data, count } as { data: WorkspaceUserReport[]; count: number };
}

async function getCouponData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient();

  const { data, count, error } = await sbAdmin
    .from('user_linked_promotions')
    .select(
      'workspace_promotions!inner(id, name, description, code, value, use_ratio)',
      {
        count: 'exact',
      }
    )
    .eq('user_id', userId)
    .eq('workspace_promotions.ws_id', wsId);

  if (error) {
    console.error('Error fetching coupon data:', error);
    return { data: [], count: 0 };
  }

  const mappedData = (data || [])
    .map((row) => row.workspace_promotions)
    .filter((promo): promo is NonNullable<typeof promo> => !!promo);

  return { data: mappedData, count: count || 0 };
}

async function getWorkspaceSettings(wsId: string) {
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

  return data;
}

async function getAvailableUsersForReferral({
  wsId,
  currentUserId,
}: {
  wsId: string;
  currentUserId: string;
}) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin.rpc('get_available_referral_users', {
    p_ws_id: wsId,
    p_user_id: currentUserId,
  });
  if (error) throw error;
  const availableUsers = (data || []) as WorkspaceUser[];
  const requireAttentionUserIds = await fetchRequireAttentionUserIds(sbAdmin, {
    wsId,
    userIds: availableUsers.map((user) => user.id),
  });

  return {
    data: availableUsers.map((user) => ({
      ...user,
      has_require_attention_feedback: requireAttentionUserIds.has(user.id),
    })),
    count: availableUsers.length,
  };
}

async function getReferredUsers({
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
  const requireAttentionUserIds = await fetchRequireAttentionUserIds(sbAdmin, {
    wsId,
    userIds: referredUsers.map((user) => user.id),
  });

  return referredUsers.map((user) => ({
    ...user,
    has_require_attention_feedback: requireAttentionUserIds.has(user.id),
  }));
}

async function getUserSentEmails({
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
  return { data: data || [], count: count || 0 };
}
