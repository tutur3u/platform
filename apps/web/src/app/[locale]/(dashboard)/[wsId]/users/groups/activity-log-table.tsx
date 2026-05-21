import { listUserGroupActivityEventsForRange } from '@/lib/user-group-activity/data';
import type { UserGroupActivityEvent } from '@/lib/user-group-activity/normalize';
import { UserGroupActivityLogClient } from './activity-log-client';

export interface UserGroupActivityLogSearchParams {
  logAction?: string | string[];
  logActorQuery?: string | string[];
  logAffectedUserQuery?: string | string[];
  logEnd?: string | string[];
  logGroupId?: string | string[];
  logPage?: string | string[];
  logPageSize?: string | string[];
  logQuery?: string | string[];
  logResourceType?: string | string[];
  logStart?: string | string[];
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveIsoRange(searchParams: UserGroupActivityLogSearchParams) {
  const now = new Date();
  const fallbackStart = new Date(now);
  fallbackStart.setDate(fallbackStart.getDate() - 30);

  const start =
    firstValue(searchParams.logStart) ?? fallbackStart.toISOString();
  const end = firstValue(searchParams.logEnd) ?? now.toISOString();

  return {
    start,
    end,
  };
}

export async function UserGroupActivityLogTable({
  wsId,
  searchParams,
  groupId,
  compact = false,
}: {
  wsId: string;
  searchParams: UserGroupActivityLogSearchParams;
  groupId?: string;
  compact?: boolean;
}) {
  const page = parsePositiveInteger(firstValue(searchParams.logPage), 1);
  const pageSize = Math.min(
    parsePositiveInteger(
      firstValue(searchParams.logPageSize),
      compact ? 8 : 20
    ),
    100
  );
  const { start, end } = resolveIsoRange(searchParams);
  const resolvedGroupId = groupId ?? firstValue(searchParams.logGroupId);

  let data: UserGroupActivityEvent[] = [];
  let count = 0;

  try {
    const response = await listUserGroupActivityEventsForRange({
      wsId,
      start,
      end,
      groupId: resolvedGroupId,
      resourceType: firstValue(searchParams.logResourceType),
      action: firstValue(searchParams.logAction),
      affectedUserQuery: firstValue(searchParams.logAffectedUserQuery),
      actorQuery: firstValue(searchParams.logActorQuery),
      query: firstValue(searchParams.logQuery),
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    data = response.data;
    count = response.count;
  } catch {
    data = [];
    count = 0;
  }

  return (
    <UserGroupActivityLogClient
      wsId={wsId}
      groupId={resolvedGroupId}
      data={data}
      count={count}
      page={page}
      pageSize={pageSize}
      compact={compact}
      filters={{
        action: firstValue(searchParams.logAction) ?? 'all',
        actorQuery: firstValue(searchParams.logActorQuery) ?? '',
        affectedUserQuery: firstValue(searchParams.logAffectedUserQuery) ?? '',
        end,
        query: firstValue(searchParams.logQuery) ?? '',
        resourceType: firstValue(searchParams.logResourceType) ?? 'all',
        start,
      }}
    />
  );
}
