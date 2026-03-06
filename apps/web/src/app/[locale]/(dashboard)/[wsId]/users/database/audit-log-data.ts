import { createClient } from '@tuturuuu/supabase/next/server';
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  subDays,
} from 'date-fns';
import { z } from 'zod';
import {
  getAuditLogTimeOptions,
  getAuditLogTimeRange,
  resolveAuditLogPeriod,
} from './audit-log-time';
import type {
  AuditLogChartStat,
  AuditLogEntry,
  AuditLogInsightSummary,
  AuditLogPeriod,
  AuditLogStatusFilter,
  AuditLogTimeOption,
} from './audit-log-types';

const AuditLogStatusSchema = z.enum(['all', 'active', 'archived']);
const AuditLogPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const AUDIT_LOG_SELECT = `
  id,
  user_id,
  ws_id,
  archived,
  archived_until,
  creator_id,
  created_at,
  user:user_id (full_name, display_name),
  creator:creator_id (full_name, display_name)
`;

export function getRecentAuditLogTimeOptions(
  locale: string,
  period: AuditLogPeriod
): AuditLogTimeOption[] {
  return getAuditLogTimeOptions({
    locale,
    period,
    count: period === 'yearly' ? 6 : 12,
  });
}

function normalizeStatus(status?: string): AuditLogStatusFilter {
  return AuditLogStatusSchema.catch('all').parse(status);
}

function buildAuditLogQuery(
  supabase: any,
  wsId: string,
  {
    period,
    month,
    year,
    status,
  }: {
    period?: string;
    month?: string;
    year?: string;
    status: AuditLogStatusFilter;
  }
) {
  const { start, end } = getAuditLogTimeRange({
    period,
    month,
    year,
  });

  let query = supabase
    .from('workspace_user_status_changes')
    .select(AUDIT_LOG_SELECT, { count: 'exact' })
    .eq('ws_id', wsId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());

  if (status === 'active') {
    query = query.eq('archived', false);
  } else if (status === 'archived') {
    query = query.eq('archived', true);
  }

  return query;
}

function mapAuditLogEntry(entry: any): AuditLogEntry {
  return {
    id: entry.id,
    user_id: entry.user_id,
    ws_id: entry.ws_id,
    archived: entry.archived,
    archived_until: entry.archived_until,
    creator_id: entry.creator_id,
    created_at: entry.created_at,
    user_full_name: entry.user?.full_name || entry.user?.display_name,
    creator_full_name: entry.creator?.full_name || entry.creator?.display_name,
  };
}

function buildAuditLogChartStats({
  locale,
  period,
  start,
  end,
}: {
  locale: string;
  period: AuditLogPeriod;
  start: Date;
  end: Date;
}): AuditLogChartStat[] {
  if (period === 'yearly') {
    const shortMonthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
    });
    const longMonthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    });

    return eachMonthOfInterval({
      start,
      end: subDays(end, 1),
    }).map<AuditLogChartStat>((date) => ({
      key: format(date, 'yyyy-MM'),
      label: shortMonthFormatter.format(date),
      tooltipLabel: longMonthFormatter.format(date),
      totalCount: 0,
      archivedCount: 0,
      activeCount: 0,
    }));
  }

  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return eachDayOfInterval({
    start,
    end: subDays(end, 1),
  }).map<AuditLogChartStat>((date) => ({
    key: format(date, 'yyyy-MM-dd'),
    label: format(date, 'd'),
    tooltipLabel: dayFormatter.format(date),
    totalCount: 0,
    archivedCount: 0,
    activeCount: 0,
  }));
}

function getEntryBucketKey(period: AuditLogPeriod, createdAt: string) {
  return format(
    new Date(createdAt),
    period === 'yearly' ? 'yyyy-MM' : 'yyyy-MM-dd'
  );
}

function getPeakBucket(chartStats: AuditLogChartStat[]) {
  return chartStats.reduce<AuditLogChartStat | null>((currentPeak, stat) => {
    if (!currentPeak || stat.totalCount > currentPeak.totalCount) {
      return stat;
    }

    return currentPeak;
  }, null);
}

export async function getAuditLogPage({
  wsId,
  period,
  month,
  year,
  status,
  page,
  pageSize,
}: {
  wsId: string;
  period?: string;
  month?: string;
  year?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const resolvedPeriod = resolveAuditLogPeriod(period);
  const resolvedStatus = normalizeStatus(status);
  const { value: selectedValue } = getAuditLogTimeRange({
    period: resolvedPeriod,
    month,
    year,
  });
  const { page: validatedPage, pageSize: validatedPageSize } =
    AuditLogPaginationSchema.parse({
      page,
      pageSize,
    });

  const start = (validatedPage - 1) * validatedPageSize;
  const end = validatedPage * validatedPageSize - 1;

  const { data, count, error } = await buildAuditLogQuery(supabase, wsId, {
    period: resolvedPeriod,
    month,
    year,
    status: resolvedStatus,
  })
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    console.error('Error fetching audit log page:', error);

    return {
      data: [] as AuditLogEntry[],
      count: 0,
      period: resolvedPeriod,
      selectedValue,
      status: resolvedStatus,
      page: validatedPage,
      pageSize: validatedPageSize,
    };
  }

  return {
    data: (data || []).map(mapAuditLogEntry),
    count: count ?? 0,
    period: resolvedPeriod,
    selectedValue,
    status: resolvedStatus,
    page: validatedPage,
    pageSize: validatedPageSize,
  };
}

export async function getAuditLogInsights({
  wsId,
  locale,
  period,
  month,
  year,
}: {
  wsId: string;
  locale: string;
  period?: string;
  month?: string;
  year?: string;
}) {
  const supabase = await createClient();
  const resolvedPeriod = resolveAuditLogPeriod(period);
  const { value, start, end } = getAuditLogTimeRange({
    period: resolvedPeriod,
    month,
    year,
  });
  const allEntries: AuditLogEntry[] = [];
  const batchSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await buildAuditLogQuery(supabase, wsId, {
      period: resolvedPeriod,
      month,
      year,
      status: 'all',
    })
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching audit log insights:', error);
      break;
    }

    const rows = (data || []).map(mapAuditLogEntry);
    allEntries.push(...rows);

    if (rows.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  const chartStats = buildAuditLogChartStats({
    locale,
    period: resolvedPeriod,
    start,
    end,
  });
  const chartLookup = new Map(
    chartStats.map((stat) => [stat.key, stat] as const)
  );
  const actorCounts = new Map<string, { name: string; count: number }>();
  const userCounts = new Map<string, { name: string; count: number }>();
  const affectedUsers = new Set<string>();

  let archivedCount = 0;
  let activeCount = 0;

  for (const entry of allEntries) {
    const bucketKey = getEntryBucketKey(resolvedPeriod, entry.created_at);
    const chartEntry = chartLookup.get(bucketKey);

    if (chartEntry) {
      chartEntry.totalCount += 1;
      if (entry.archived) {
        chartEntry.archivedCount += 1;
      } else {
        chartEntry.activeCount += 1;
      }
    }

    if (entry.archived) {
      archivedCount += 1;
    } else {
      activeCount += 1;
    }

    affectedUsers.add(entry.user_id);

    const actorKey = entry.creator_id || 'system';
    actorCounts.set(actorKey, {
      name: entry.creator_full_name || 'Unknown',
      count: (actorCounts.get(actorKey)?.count || 0) + 1,
    });

    userCounts.set(entry.user_id, {
      name: entry.user_full_name || 'Unknown User',
      count: (userCounts.get(entry.user_id)?.count || 0) + 1,
    });
  }

  const peakBucket = getPeakBucket(chartStats);
  const topActor =
    Array.from(actorCounts.values()).sort((left, right) => {
      return right.count - left.count;
    })[0] ?? null;
  const topUser =
    Array.from(userCounts.values()).sort((left, right) => {
      return right.count - left.count;
    })[0] ?? null;

  const summary: AuditLogInsightSummary = {
    totalChanges: allEntries.length,
    archivedCount,
    activeCount,
    affectedUsersCount: affectedUsers.size,
    topActorName: topActor?.name || null,
    topActorCount: topActor?.count || 0,
    topUserName: topUser?.name || null,
    topUserCount: topUser?.count || 0,
    peakBucketLabel: peakBucket?.tooltipLabel || null,
    peakBucketCount: peakBucket?.totalCount || 0,
  };

  return {
    period: resolvedPeriod,
    timeValue: value,
    summary,
    chartStats,
  };
}
