'use client';

import { Eye } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { UserGroupActivityEvent } from '@tuturuuu/users-core/lib/user-group-activity/normalize';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { UserGroupActivityDetailSheet } from './activity-log-detail-sheet';
import {
  type ActivityLogFilters,
  UserGroupActivityFilters,
} from './activity-log-filters';
import { formatActivityDateTime } from './activity-log-utils';

function ActivityLogRows({
  data,
  onSelect,
}: {
  data: UserGroupActivityEvent[];
  onSelect: (event: UserGroupActivityEvent) => void;
}) {
  const t = useTranslations();

  if (data.length === 0) {
    return (
      <tr>
        <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
          {t('ws-user-group-activity.empty')}
        </td>
      </tr>
    );
  }

  return data.map((event) => (
    <tr key={event.auditRecordId} className="border-border/70 border-t">
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
        {formatActivityDateTime(event.occurredAt)}
      </td>
      <td className="px-3 py-2">
        <div className="font-medium">{event.summary}</div>
        {event.group.name && (
          <div className="text-muted-foreground text-xs">
            {event.group.name}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t(`ws-user-group-activity.resources.${event.resourceType}`)}
          </Badge>
          <Badge variant="outline">
            {t(`ws-user-group-activity.actions.${event.action}`)}
          </Badge>
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {event.actor.name ||
          event.actor.email ||
          event.actor.authUid ||
          t('ws-user-group-activity.unknown_actor')}
      </td>
      <td className="px-3 py-2 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onSelect(event)}
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only">
            {t('ws-user-group-activity.view_details')}
          </span>
        </Button>
      </td>
    </tr>
  ));
}

export function UserGroupActivityLogClient({
  data,
  count,
  page,
  pageSize,
  filters,
  compact,
}: {
  wsId: string;
  groupId?: string;
  data: UserGroupActivityEvent[];
  count: number;
  page: number;
  pageSize: number;
  compact?: boolean;
  filters: ActivityLogFilters;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedEvent, setSelectedEvent] =
    useState<UserGroupActivityEvent | null>(null);

  const totalPages = Math.max(Math.ceil(count / pageSize), 1);
  const hasFilters = useMemo(
    () =>
      filters.action !== 'all' ||
      filters.resourceType !== 'all' ||
      filters.actorQuery.length > 0 ||
      filters.affectedUserQuery.length > 0 ||
      filters.query.length > 0,
    [filters]
  );

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!compact) {
      params.set('tab', 'audit-log');
    }

    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <>
      <div className="space-y-3">
        <UserGroupActivityFilters
          filters={filters}
          compact={compact}
          isPending={isPending}
          hasFilters={hasFilters}
          updateSearchParams={updateSearchParams}
        />

        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  {t('ws-user-group-activity.when')}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t('ws-user-group-activity.summary')}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t('ws-user-group-activity.resource')}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t('ws-user-group-activity.actor')}
                </th>
                <th className="w-16 px-3 py-2 text-right font-medium">
                  {t('ws-user-group-activity.details')}
                </th>
              </tr>
            </thead>
            <tbody>
              <ActivityLogRows data={data} onSelect={setSelectedEvent} />
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            {t('ws-user-group-activity.page_summary', {
              page,
              totalPages,
              count,
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() =>
                updateSearchParams({ logPage: String(Math.max(page - 1, 1)) })
              }
            >
              {t('ws-user-group-activity.previous')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() =>
                updateSearchParams({
                  logPage: String(Math.min(page + 1, totalPages)),
                })
              }
            >
              {t('ws-user-group-activity.next')}
            </Button>
          </div>
        </div>
      </div>

      <UserGroupActivityDetailSheet
        selectedEvent={selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      />
    </>
  );
}
