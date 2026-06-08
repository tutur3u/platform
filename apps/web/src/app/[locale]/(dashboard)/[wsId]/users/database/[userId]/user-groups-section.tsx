'use client';

import { CalendarDays, ChevronDown, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useState } from 'react';
import { DetailCard, EmptyPanel } from './detail-card';
import type { UserGroupMembership } from './types';

export function UserGroupsSection({
  wsId,
  scheduledGroups,
  unscheduledGroups,
  labels,
}: {
  wsId: string;
  scheduledGroups: UserGroupMembership[];
  unscheduledGroups: UserGroupMembership[];
  labels: {
    groups: string;
    hideUnscheduled: string;
    manager: string;
    noSchedule: string;
    noScheduledGroups: string;
    sessions: string;
    showUnscheduled: string;
    scheduledGroups: string;
    unknown: string;
    unscheduledGroups: string;
  };
}) {
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  return (
    <div className="grid gap-4">
      <DetailCard
        title={labels.groups}
        description={labels.scheduledGroups}
        meta={<Badge variant="secondary">{scheduledGroups.length}</Badge>}
      >
        {scheduledGroups.length > 0 ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {scheduledGroups.map((group) => (
              <GroupLink
                key={group.id}
                wsId={wsId}
                group={group}
                labels={labels}
              />
            ))}
          </div>
        ) : (
          <EmptyPanel>{labels.noScheduledGroups}</EmptyPanel>
        )}
      </DetailCard>

      {unscheduledGroups.length > 0 && (
        <Collapsible
          open={showUnscheduled}
          onOpenChange={setShowUnscheduled}
          className="rounded-xl border border-dynamic-border bg-card/70 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-base">
                {labels.unscheduledGroups}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {labels.noSchedule}
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                {showUnscheduled
                  ? labels.hideUnscheduled
                  : labels.showUnscheduled}
                <Badge variant="secondary">{unscheduledGroups.length}</Badge>
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    showUnscheduled && 'rotate-180'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="pt-4">
            <div className="grid gap-2 lg:grid-cols-2">
              {unscheduledGroups.map((group) => (
                <GroupLink
                  key={group.id}
                  wsId={wsId}
                  group={group}
                  labels={labels}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function GroupLink({
  wsId,
  group,
  labels,
}: {
  wsId: string;
  group: UserGroupMembership;
  labels: {
    manager: string;
    noSchedule: string;
    sessions: string;
    unknown: string;
  };
}) {
  const isManager = group.workspace_user_groups_users?.[0]?.role === 'TEACHER';
  const sessionsCount = group.sessions?.length ?? 0;
  const dateRange = formatDateRange(group.starting_date, group.ending_date);

  return (
    <Button
      asChild
      variant="secondary"
      className="h-auto justify-start whitespace-normal rounded-lg py-3 text-left"
    >
      <Link href={`/${wsId}/users/groups/${group.id}`}>
        <Users className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 font-medium">
            {group.name || labels.unknown}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <CalendarDays className="size-3.5" />
            {sessionsCount > 0
              ? `${sessionsCount} ${labels.sessions}`
              : labels.noSchedule}
            {dateRange && <span>{dateRange}</span>}
          </span>
        </span>
        {isManager && (
          <Badge
            variant="outline"
            className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
          >
            {labels.manager}
          </Badge>
        )}
      </Link>
    </Button>
  );
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return null;
  const formattedStart = start ? formatDate(start) : null;
  const formattedEnd = end ? formatDate(end) : null;

  if (formattedStart && formattedEnd)
    return `${formattedStart} - ${formattedEnd}`;
  return formattedStart ?? formattedEnd;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
