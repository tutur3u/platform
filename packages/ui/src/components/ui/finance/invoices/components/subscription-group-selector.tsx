'use client';

import {
  AlertTriangle,
  CheckIcon,
  ChevronDown,
  Loader2,
} from '@tuturuuu/icons';
import type { Database } from '@tuturuuu/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';
import { type GroupPaymentStatus, getGroupPaymentStatus } from '../utils';

type LatestInvoice = {
  group_id?: string;
  valid_until?: string | null;
  created_at?: string | null;
};

type UserGroupItem = {
  workspace_user_groups:
    | Database['public']['Tables']['workspace_user_groups']['Row']
    | null;
};

function hasSchedule(group: UserGroupItem['workspace_user_groups']): boolean {
  const sessions = group?.sessions;
  return Array.isArray(sessions) && sessions.length > 0;
}

function isMonthPaidForGroup(
  groupId: string,
  selectedMonth: string,
  latestInvoices: LatestInvoice[]
): boolean {
  const inv = latestInvoices.find((i) => i.group_id === groupId);
  if (!inv?.valid_until) return false;
  const monthStart = new Date(`${selectedMonth}-01`);
  const validUntilStart = new Date(inv.valid_until);
  validUntilStart.setDate(1);
  return monthStart < validUntilStart;
}

interface SubscriptionGroupSelectorProps {
  userGroups: UserGroupItem[];
  userGroupsLoading: boolean;
  selectedGroupIds: string[];
  onGroupSelect: (groupId: string) => void;
  onSelectAllWithSchedule?: () => void;
  onDeselectAll?: () => void;
  isLoadingSubscriptionData: boolean;
  locale: string;
  selectedMonth: string;
  latestSubscriptionInvoices?: LatestInvoice[];
}

function statusBadgeClass(status: GroupPaymentStatus): string {
  switch (status) {
    case 'active':
      return 'rounded-full bg-dynamic-green/10 px-2 py-0.5 font-medium text-[10px] text-dynamic-green uppercase tracking-wide';
    case 'expiringSoon':
      return 'rounded-full bg-dynamic-yellow/10 px-2 py-0.5 font-medium text-[10px] text-dynamic-yellow uppercase tracking-wide';
    case 'expired':
      return 'rounded-full bg-dynamic-red/10 px-2 py-0.5 font-medium text-[10px] text-dynamic-red uppercase tracking-wide';
    default:
      return '';
  }
}

function GroupRow({
  group,
  isSelected,
  isMonthPaid,
  latestInvoice,
  locale,
  isLoadingSubscriptionData,
  onToggle,
  t,
}: {
  group: Database['public']['Tables']['workspace_user_groups']['Row'];
  isSelected: boolean;
  isMonthPaid: boolean;
  latestInvoice: LatestInvoice | undefined;
  locale: string;
  isLoadingSubscriptionData: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  const paymentStatus = getGroupPaymentStatus(group, latestInvoice);
  return (
    <button
      type="button"
      className={`flex w-full cursor-pointer select-none items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
        isSelected ? 'border-primary bg-primary/5' : ''
      }`}
      onClick={() => onToggle()}
      aria-label={t('ws-invoices.select_group')}
      aria-pressed={isSelected}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-colors',
          isSelected && 'border-primary bg-primary text-primary-foreground'
        )}
        aria-hidden
      >
        {isSelected ? <CheckIcon className="size-3" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{group.name}</h3>
          {isLoadingSubscriptionData && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          )}
          <span
            className={statusBadgeClass(paymentStatus)}
            title={
              paymentStatus === 'active'
                ? t('ws-invoices.status_active')
                : paymentStatus === 'expiringSoon'
                  ? t('ws-invoices.status_expiring_soon')
                  : t('ws-invoices.status_expired')
            }
          >
            {paymentStatus === 'active'
              ? t('ws-invoices.status_active')
              : paymentStatus === 'expiringSoon'
                ? t('ws-invoices.status_expiring_soon')
                : t('ws-invoices.status_expired')}
          </span>
          {!isMonthPaid && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-dynamic-yellow/15 px-2 py-0.5 font-medium text-[10px] text-dynamic-yellow"
              title={t('ws-invoices.current_month_unpaid_warning')}
            >
              <AlertTriangle className="h-3 w-3" />
              {t('ws-invoices.month_unpaid')}
            </span>
          )}
        </div>
        {(latestInvoice?.created_at || latestInvoice?.valid_until) && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
            {latestInvoice?.created_at && (
              <span>
                {t('ws-invoices.last_payment')}{' '}
                {new Date(latestInvoice.created_at).toLocaleDateString(locale)}
              </span>
            )}
            {latestInvoice?.valid_until && (
              <span>
                {t('ws-invoices.valid_until')}{' '}
                {new Date(latestInvoice.valid_until).toLocaleDateString(locale)}
              </span>
            )}
          </p>
        )}
      </div>
    </button>
  );
}

export function SubscriptionGroupSelector({
  userGroups,
  userGroupsLoading,
  selectedGroupIds,
  onGroupSelect,
  onSelectAllWithSchedule,
  onDeselectAll,
  isLoadingSubscriptionData,
  locale,
  selectedMonth,
  latestSubscriptionInvoices = [],
}: SubscriptionGroupSelectorProps): React.ReactElement {
  const t = useTranslations();
  const [showNoSchedule, setShowNoSchedule] = useState(false);

  const groupsWithSchedule = userGroups.filter(
    (g) => g.workspace_user_groups && hasSchedule(g.workspace_user_groups)
  );
  const groupsWithoutSchedule = userGroups.filter(
    (g) => g.workspace_user_groups && !hasSchedule(g.workspace_user_groups)
  );

  const allWithScheduleSelected =
    groupsWithSchedule.length > 0 &&
    groupsWithSchedule.every((g) =>
      g.workspace_user_groups
        ? selectedGroupIds.includes(g.workspace_user_groups.id)
        : false
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{t('ws-invoices.user_groups')}</CardTitle>
            <CardDescription className="mt-1 flex flex-col gap-1">
              <span>{t('ws-invoices.user_groups_description')}</span>
              <span className="text-muted-foreground text-xs">
                {t('ws-invoices.groups_reset_on_customer_change')}
              </span>
            </CardDescription>
          </div>
          {isLoadingSubscriptionData && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
        {groupsWithSchedule.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
              onClick={
                allWithScheduleSelected
                  ? onDeselectAll
                  : onSelectAllWithSchedule
              }
            >
              {allWithScheduleSelected
                ? t('ws-invoices.deselect_all')
                : t('ws-invoices.select_all_with_schedule')}
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {userGroupsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-muted-foreground text-sm">
                {t('ws-invoices.loading_groups')}
              </p>
            </div>
          </div>
        ) : userGroups.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t('ws-invoices.no_groups_found')}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {groupsWithSchedule.map((groupItem) => {
                const group = groupItem.workspace_user_groups;
                if (!group) return null;
                const isSelected = selectedGroupIds.includes(group.id);
                const latestInvoice = latestSubscriptionInvoices.find(
                  (inv) => inv.group_id === group.id
                );
                const isMonthPaid = isMonthPaidForGroup(
                  group.id,
                  selectedMonth,
                  latestSubscriptionInvoices
                );
                return (
                  <GroupRow
                    key={group.id}
                    group={group}
                    isSelected={isSelected}
                    isMonthPaid={isMonthPaid}
                    latestInvoice={latestInvoice}
                    locale={locale}
                    isLoadingSubscriptionData={isLoadingSubscriptionData}
                    onToggle={() => onGroupSelect(group.id)}
                    t={t as (key: string) => string}
                  />
                );
              })}
            </div>

            {groupsWithoutSchedule.length > 0 && (
              <Collapsible
                open={showNoSchedule}
                onOpenChange={setShowNoSchedule}
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 [&[data-state=open]]:border-muted-foreground/30">
                  <span className="text-sm">
                    {t('ws-invoices.groups_without_schedule', {
                      count: groupsWithoutSchedule.length,
                    })}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${showNoSchedule ? 'rotate-180' : ''}`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2">
                    {groupsWithoutSchedule.map((groupItem) => {
                      const group = groupItem.workspace_user_groups;
                      if (!group) return null;
                      const isSelected = selectedGroupIds.includes(group.id);
                      const latestInvoice = latestSubscriptionInvoices.find(
                        (inv) => inv.group_id === group.id
                      );
                      const isMonthPaid = isMonthPaidForGroup(
                        group.id,
                        selectedMonth,
                        latestSubscriptionInvoices
                      );
                      return (
                        <GroupRow
                          key={group.id}
                          group={group}
                          isSelected={isSelected}
                          isMonthPaid={isMonthPaid}
                          latestInvoice={latestInvoice}
                          locale={locale}
                          isLoadingSubscriptionData={isLoadingSubscriptionData}
                          onToggle={() => onGroupSelect(group.id)}
                          t={t as (key: string) => string}
                        />
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
