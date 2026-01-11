import { Users } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { invoiceColumns } from '@tuturuuu/ui/finance/invoices/columns';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import moment from 'moment';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import UserMonthAttendance from '../../attendance/user-month-attendance';
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
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

const EMAIL_PAGE_SIZE = 10;

export default async function WorkspaceUserDetailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations('user-data-table');
  const { wsId: id, userId } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const hasPrivateInfo = containsPermission('view_users_private_info');
  const hasPublicInfo = containsPermission('view_users_public_info');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canUpdateUsers = containsPermission('update_users');

  // User must have at least one permission to view user details
  if (!hasPrivateInfo && !hasPublicInfo) {
    notFound();
  }

  const data = await getData({ wsId, userId, hasPrivateInfo, hasPublicInfo });

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

  const { data: rawInvoiceData, count: invoiceCount } = await getInvoiceData(
    wsId,
    userId,
    await searchParams
  );

  const { data: sentEmails, count: sentEmailCount } = await getUserSentEmails({
    wsId,
    userId,
    pageSize: EMAIL_PAGE_SIZE,
  });

  const invoiceData = rawInvoiceData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/invoices/${d.id}`,
    ws_id: wsId,
  }));

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
          {data.full_name && <div>{data.full_name}</div>}
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
              <span>{data.referrer.display_name || data.full_name || '-'}</span>
            </Link>
          )}
        </div>
      )}

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
                {data.display_name}
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
                full_name: data.display_name || data.full_name,
                href: `/${wsId}/users/database/${data.id}`,
                archived: data.archived,
                archived_until: data.archived_until,
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
                    {groups.map((group) => (
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
                        </Button>
                      </Link>
                    ))}
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
              initialPromotions={coupons.map((c) => ({
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
        <>
          <div className="mt-4 mb-2 font-semibold text-lg">
            {t('invoices')} ({invoiceCount})
          </div>
          <CustomDataTable
            data={invoiceData}
            columnGenerator={invoiceColumns}
            namespace="invoice-data-table"
            count={invoiceCount}
            defaultVisibility={{
              id: false,
              customer: false,
              customer_id: false,
              price: false,
              total_diff: false,
              note: false,
            }}
          />
        </>
      )}
    </div>
  );
}

async function isUserGuest(user_id: string) {
  const supabase = await createClient();

  const user_uuid = user_id;

  const { data, error } = await supabase.rpc('is_user_guest', {
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
  const supabase = await createClient();

  // Use raw SQL query via RPC to avoid complex PostgREST syntax
  const { data: rawData, error } = (await supabase.rpc(
    'get_workspace_user_with_details',
    {
      p_ws_id: wsId,
      p_user_id: userId,
    }
  )) as { data: any; error: any };
  if (error) throw error;
  if (!rawData) notFound();

  const data = {
    ...rawData,
    linked_users: (rawData.linked_users || [])
      .map(
        ({
          platform_user_id,
          users,
        }: {
          platform_user_id: string;
          users: {
            display_name: string | null;
          } | null;
        }) =>
          users
            ? { id: platform_user_id, display_name: users.display_name || '' }
            : null
      )
      .filter((v: WorkspaceUser | null) => v),
    referrer: rawData.referrer
      ? {
          id: rawData.referrer.id,
          display_name:
            rawData.referrer.display_name || rawData.referrer.full_name || '',
        }
      : undefined,
  };

  // Sanitize data based on permissions
  const sanitized: any = { ...data };

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
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups')
    .select('*, workspace_user_groups_users!inner(user_id)', {
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
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('external_user_monthly_reports')
    .select('*, user:workspace_users!user_id!inner(ws_id)', {
      count: 'exact',
    })
    .eq('user_id', userId)
    .eq('user.ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data: rawData, count, error } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map((rowData) => {
    const preprocessedData: {
      user?: any;
      [key: string]: any;
    } = {
      ...rowData,
    };

    delete preprocessedData.user;
    return preprocessedData as WorkspaceUserReport;
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
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_promotions')
    .select('*, user_linked_promotions!inner(user_id)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .eq('user_linked_promotions.user_id', userId);

  const { data, count, error } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}

async function getInvoiceData(
  wsId: string,
  userId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*, customer:workspace_users!customer_id(full_name)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('notice', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(({ customer, ...rest }) => ({
    ...rest,
    customer: customer?.full_name || '-',
  }));

  return { data, count } as { data: Invoice[]; count: number };
}

async function getWorkspaceSettings(wsId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_settings')
    .select('referral_count_cap, referral_increment_percent')
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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_available_referral_users', {
    p_ws_id: wsId,
    p_user_id: currentUserId,
  });
  if (error) throw error;
  return { data, count: data?.length || 0 };
}

async function getReferredUsers({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_users')
    .select('id, full_name, display_name, email, phone')
    .eq('ws_id', wsId)
    .eq('referred_by', userId)
    .eq('archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as WorkspaceUser[];
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
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from('sent_emails')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .limit(pageSize);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}
