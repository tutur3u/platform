'use client';

import { useQuery } from '@tanstack/react-query';
import { Sprout, UserCheck } from '@tuturuuu/icons';
import {
  type HiveAccessRequest,
  type HiveMember,
  listHiveAccessRequests,
  listHiveMembers,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { HiveAccessMetrics } from './hive-access-metrics';
import {
  getHiveMemberMap,
  HIVE_ACCESS_REQUEST_QUERY_KEY,
  HIVE_MEMBER_QUERY_KEY,
  useHiveAccessApprovalMutation,
  useHiveAccessMutation,
} from './hive-access-query';
import { HiveAccessRequestsPanel } from './hive-access-requests-panel';
import { HiveAccessRow } from './hive-access-row';
import type { PlatformUserWithDetails } from './types';

type HiveAccessPanelProps = {
  initialAvailable: boolean;
  initialMembers: HiveMember[];
  initialRequests: HiveAccessRequest[];
  locale: string;
  totalUsers: number;
  users: PlatformUserWithDetails[];
};

export function HiveAccessPanel({
  initialAvailable,
  initialMembers,
  initialRequests,
  locale,
  totalUsers,
  users,
}: HiveAccessPanelProps) {
  const t = useTranslations('platform-roles');
  const membersQuery = useQuery({
    enabled: initialAvailable,
    initialData: { members: initialMembers },
    queryFn: () => listHiveMembers(),
    queryKey: HIVE_MEMBER_QUERY_KEY,
  });
  const requestsQuery = useQuery({
    enabled: initialAvailable,
    initialData: { requests: initialRequests },
    queryFn: () => listHiveAccessRequests(),
    queryKey: HIVE_ACCESS_REQUEST_QUERY_KEY,
  });
  const members = membersQuery.data?.members ?? [];
  const requests = requestsQuery.data?.requests ?? [];
  const memberByUserId = getHiveMemberMap(members);
  const visibleHiveEnabled = users.filter(
    (user) => memberByUserId.get(user.id)?.enabled
  ).length;
  const hiveEnabledTotal = members.filter((member) => member.enabled).length;
  const mutation = useHiveAccessMutation({
    disabledToast: t('hive_access_disabled_toast'),
    enabledToast: t('hive_access_enabled_toast'),
    members,
    updateFailedToast: t('hive_access_update_failed'),
  });
  const approvalMutation = useHiveAccessApprovalMutation({
    approveFailedToast: t('hive_access_request_approve_failed'),
    approvedToast: t('hive_access_request_approved_toast'),
  });

  return (
    <section className="rounded-lg border border-dynamic-border bg-dynamic-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-dynamic-green" />
            <h2 className="font-semibold text-lg">{t('hive_access_title')}</h2>
          </div>
          <p className="mt-1 text-dynamic-muted-foreground text-sm">
            {t(
              initialAvailable
                ? 'hive_access_description'
                : 'hive_access_unavailable'
            )}
          </p>
        </div>

        <HiveAccessMetrics
          hiveEnabledTotal={hiveEnabledTotal}
          labels={{
            matchingUsers: t('matching_users'),
            total: t('hive_access_total'),
            visible: t('hive_access_visible'),
          }}
          totalUsers={totalUsers}
          visibleHiveEnabled={visibleHiveEnabled}
        />
      </div>

      <HiveAccessRequestsPanel
        labels={{
          approve: t('hive_access_request_approve'),
          description: t('hive_access_pending_requests_description'),
          empty: t('hive_access_no_pending_requests'),
          requestedAt: t('hive_access_requested_at'),
          title: t('hive_access_pending_requests'),
        }}
        locale={locale}
        onApprove={(request) =>
          approvalMutation.mutate({
            notes:
              request.note ||
              `Approved Hive access request from ${
                request.email ?? request.userId
              }`,
            requestId: request.id,
          })
        }
        pendingRequestId={
          approvalMutation.isPending
            ? approvalMutation.variables?.requestId
            : undefined
        }
        requests={requests}
      />

      <div className="mt-4 grid gap-2 xl:grid-cols-2">
        {users.map((user) => {
          const hiveMember = memberByUserId.get(user.id);
          const enabled = hiveMember?.enabled === true;
          const pending =
            mutation.isPending && mutation.variables?.userId === user.id;

          return (
            <HiveAccessRow
              disabled={!initialAvailable}
              enabled={enabled}
              key={user.id}
              labels={{
                disabled: t('hive_access_disabled'),
                enabled: t('hive_access_enabled'),
                toggle: t('hive_access_toggle_label'),
              }}
              locale={locale}
              onToggle={(checked) =>
                mutation.mutate({ enabled: checked, userId: user.id })
              }
              pending={pending}
              user={user}
            />
          );
        })}
      </div>

      {users.length === 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-dynamic-border/70 bg-dynamic-muted/30 p-4 text-dynamic-muted-foreground text-sm">
          <UserCheck className="h-4 w-4" />
          {t('hive_access_empty')}
        </div>
      )}
    </section>
  );
}
