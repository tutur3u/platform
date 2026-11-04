import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '../../../features/reports/report-limits';
import {
  isReportMonth,
  resolveReportMonth,
} from '../../../features/reports/report-month';
import { getUserGroupMembershipsForActor } from '../../../lib/user-groups/groups-utils';
import { getUserGroupRoutePermissions } from '../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../lib/user-groups/route-helpers';
import {
  DELIVERY_CATEGORIES,
  periodicDeliveryCategory,
} from './report-delivery-category';
import {
  collectReportList,
  MAX_REPORT_LIST_ROWS,
  ReportListLimitError,
  sortReportList,
  summarizeReportList,
} from './report-list-query';
import {
  buildReportMonthFilter,
  buildReportPeriodFilter,
  resolveReportPeriodTimezone,
} from './report-period-filter';
import {
  buildPeriodicReportFallbackFilter,
  isMissingReportSearchRpc,
} from './report-search';
import { getPeriodicReportSortColumn } from './report-sorting';
import { normalizeReportStages, PERIODIC_REPORT_STAGES } from './report-stages';

const CreateReportSchema = z.object({
  user_id: z.guid(),
  group_id: z.guid(),
  title: z.string().min(1).max(MAX_MONTHLY_REPORT_TITLE_LENGTH),
  content: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  feedback: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  score: z.number().nullable().optional(),
  scores: z.array(z.number()).nullable().optional(),
  cadence: z
    .enum(['weekly', 'monthly', 'quarterly', 'yearly'])
    .default('monthly'),
  period_start: z.iso.date().nullable().optional(),
  period_end: z.iso.date().nullable().optional(),
  generation_mode: z.enum(['manual', 'ai']).default('manual'),
  manager_instruction: z
    .string()
    .max(MAX_MONTHLY_REPORT_TEXT_LENGTH)
    .nullable()
    .optional(),
});

const ListReportsSchema = z.object({
  stage: z.enum(PERIODIC_REPORT_STAGES).optional(),
  category: z.enum(DELIVERY_CATEGORIES).optional(),
  generationStatus: z
    .enum(['draft', 'generating', 'ready', 'failed'])
    .optional(),
  approvalStatus: z
    .enum(['UNAPPROVED', 'PENDING', 'APPROVED', 'REJECTED'])
    .optional(),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  // The month reports cover: saved period, else estimated from created_at.
  month: z.string().refine(isReportMonth).optional(),
  cadence: z
    .enum(['all', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .default('monthly'),
  deliveryStatus: z
    .enum([
      'draft',
      'queued',
      'processing',
      'sent',
      'failed',
      'blocked',
      'cancelled',
      'skipped',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  sortBy: z.enum(['period', 'title', 'updated', 'user']).default('period'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  // Viewer timezone, used for the period range only when the workspace has none.
  timezone: z.string().trim().max(64).optional(),
});

// Columns needed to summarize the stage cards and delivery categories.
const SUMMARY_COLUMNS =
  'id,report_stage,delivery_status,user_email,last_delivery_error,report_approval_status,generation_status,delivered_at';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const parsed = ListReportsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (
      !parsed.success ||
      (parsed.data.periodStart &&
        parsed.data.periodEnd &&
        parsed.data.periodStart > parsed.data.periodEnd) ||
      // A month and a custom range are alternatives, never combined.
      (parsed.data.month && (parsed.data.periodStart || parsed.data.periodEnd))
    ) {
      return NextResponse.json(
        {
          message: 'Invalid query parameters',
          issues: parsed.success ? [] : parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (
      !permissions?.containsPermission('view_user_groups_reports') &&
      !permissions?.containsPermission('approve_reports')
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const actorAuthUid = await resolveRequestActorAuthUid(request);
    const accessibleGroupIds = permissions.containsPermission('manage_users')
      ? null
      : actorAuthUid
        ? await getUserGroupMembershipsForActor(wsId, actorAuthUid)
        : [];
    if (accessibleGroupIds?.length === 0) {
      return NextResponse.json({
        counts: {
          stages: normalizeReportStages(null),
          approved: 0,
          blocked: 0,
          delivered: 0,
          draft: 0,
          failed: 0,
          pendingReview: 0,
          total: 0,
        },
        categoryCounts: Object.fromEntries(
          DELIVERY_CATEGORIES.map((category) => [category, 0])
        ),
        data: [],
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        summaryPartial: false,
        total: 0,
        workspace: { id: wsId, timezone: null },
      });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const from = (parsed.data.page - 1) * parsed.data.pageSize;

    const workspacePromise = sbAdmin
      .from('workspaces')
      .select('id, timezone')
      .eq('id', wsId)
      .single()
      .then((result) => result);
    const timezonePromise = Promise.resolve(workspacePromise).then((result) => {
      if (result.error) throw result.error;
      return resolveReportPeriodTimezone(
        result.data?.timezone,
        parsed.data.timezone
      );
    });
    // Awaited below; never an unhandled rejection if the list fails first.
    timezonePromise.catch(() => {});
    const periodFilter = parsed.data.month
      ? buildReportMonthFilter({
          month: parsed.data.month,
          timezone: await timezonePromise,
        })
      : parsed.data.periodStart || parsed.data.periodEnd
        ? buildReportPeriodFilter({
            periodStart: parsed.data.periodStart,
            periodEnd: parsed.data.periodEnd,
            timezone: await timezonePromise,
          })
        : null;

    const sortColumn = getPeriodicReportSortColumn(parsed.data.sortBy);
    // `summary` rows feed the stage cards, which must not be narrowed to the
    // stage being listed; otherwise every other card reads 0.
    const buildListQuery = (
      useSmartSearch: boolean,
      offset: number,
      limit: number,
      cadence = parsed.data.cadence,
      scope: 'list' | 'summary' = 'list'
    ) => {
      const fallbackSource = privateDb.from(
        'external_user_monthly_reports_workspace_view'
      );
      const source =
        useSmartSearch && parsed.data.q
          ? (
              privateDb.rpc as unknown as (
                name: string,
                args: {
                  p_cadence: string;
                  p_group_ids: string[] | null;
                  p_search: string;
                  p_ws_id: string;
                },
                options: { count: 'exact' }
              ) => typeof fallbackSource
            )(
              'search_periodic_reports',
              {
                p_cadence: cadence,
                p_group_ids: accessibleGroupIds,
                p_search: parsed.data.q,
                p_ws_id: wsId,
              },
              { count: 'exact' }
            )
          : fallbackSource;

      let query = source
        // The cast keeps one row type for both scopes; summary rows are read
        // only through the SummaryRow fields below.
        .select((scope === 'summary' ? SUMMARY_COLUMNS : '*') as '*', {
          count: 'exact',
        })
        .order(sortColumn, {
          ascending: parsed.data.sortDirection === 'asc',
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: parsed.data.sortDirection === 'asc',
          nullsFirst: false,
        })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (!useSmartSearch) {
        query = query.eq('user_ws_id', wsId);
        if (cadence !== 'all') query = query.eq('cadence', cadence);
        if (accessibleGroupIds) {
          query = query.in('group_id', accessibleGroupIds);
        }
      }
      if (periodFilter) query = query.or(periodFilter);
      if (parsed.data.stage && scope === 'list')
        query = query.eq('report_stage', parsed.data.stage);
      if (parsed.data.approvalStatus === 'UNAPPROVED') {
        query = query.or(
          'report_approval_status.neq.APPROVED,report_approval_status.is.null'
        );
      } else if (parsed.data.approvalStatus) {
        query = query.eq('report_approval_status', parsed.data.approvalStatus);
      }
      if (parsed.data.generationStatus) {
        query = query.eq('generation_status', parsed.data.generationStatus);
      }
      if (parsed.data.deliveryStatus) {
        query = query.eq('delivery_status', parsed.data.deliveryStatus);
      }
      if (!useSmartSearch && parsed.data.q) {
        query = query.or(buildPeriodicReportFallbackFilter(parsed.data.q));
      }
      return query;
    };

    const smartSearch = Boolean(parsed.data.q);
    const collect = async (
      useSmartSearch: boolean,
      scope: 'list' | 'summary' = 'list'
    ) => {
      if (!useSmartSearch || parsed.data.cadence !== 'all') {
        return collectReportList((offset, limit) =>
          buildListQuery(
            useSmartSearch,
            offset,
            limit,
            parsed.data.cadence,
            scope
          )
        );
      }
      // The deployed search RPC accepts one cadence. All uses the same RPC
      // predicate for every cadence; never replace it with phrase-only search.
      const cadences = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
      const rows: NonNullable<
        Awaited<ReturnType<typeof buildListQuery>>['data']
      > = [];
      for (const cadence of cadences) {
        rows.push(
          ...(await collectReportList(
            (offset, limit) =>
              buildListQuery(true, offset, limit, cadence, scope),
            MAX_REPORT_LIST_ROWS - rows.length
          ))
        );
      }
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new Error('Report scope changed. Refresh reports.');
      }
      return sortReportList<(typeof rows)[number], typeof sortColumn>(
        rows,
        sortColumn,
        parsed.data.sortDirection === 'asc'
      );
    };
    const collectScope = (scope: 'list' | 'summary') =>
      collect(smartSearch, scope).catch((error: unknown) => {
        if (smartSearch && isMissingReportSearchRpc(error))
          return collect(false, scope);
        throw error;
      });
    type SummaryRow = Pick<
      Awaited<ReturnType<typeof collect>>[number],
      | 'id'
      | 'report_stage'
      | 'delivery_status'
      | 'user_email'
      | 'last_delivery_error'
      | 'report_approval_status'
      | 'generation_status'
      | 'delivered_at'
    >;
    const [allRows, stageSummaryRows, workspaceResult] = await Promise.all([
      collectScope('list'),
      parsed.data.stage
        ? (collectScope('summary') as Promise<SummaryRow[]>).catch(
            (error: unknown) => {
              // The all-stage cards are optional: a capped or failed read must
              // not fail the list, so fall back to the stage-scoped counts.
              if (!(error instanceof ReportListLimitError))
                console.error('Error in reports GET stage summary:', error);
              return null;
            }
          )
        : null,
      workspacePromise,
    ]);
    if (workspaceResult.error) throw workspaceResult.error;
    const inCategory = <
      Row extends Parameters<typeof periodicDeliveryCategory>[0],
    >(
      rows: Row[]
    ) =>
      parsed.data.category
        ? rows.filter(
            (row) => periodicDeliveryCategory(row) === parsed.data.category
          )
        : rows;
    const filteredRows = inCategory(allRows);
    // Category counts follow the listed rows; stage counts cover every stage
    // unless the summary read was unavailable (`summaryPartial`).
    const summaryPartial = Boolean(parsed.data.stage) && !stageSummaryRows;
    const { categoryCounts } = summarizeReportList(filteredRows);
    const { counts } = summarizeReportList(
      stageSummaryRows ? inCategory(stageSummaryRows) : filteredRows
    );
    const listResult = {
      data: filteredRows.slice(from, from + parsed.data.pageSize),
      count: filteredRows.length,
    };

    const reportIds = (listResult.data ?? []).flatMap((row) =>
      row.id ? [row.id] : []
    );
    const testDeliveries = reportIds.length
      ? await privateDb
          .from('user_report_email_queue')
          .select('report_id, status, sent_at')
          .eq('ws_id', wsId)
          .eq('delivery_kind', 'test')
          .in('report_id', reportIds)
      : { data: [], error: null };
    if (testDeliveries.error) throw testDeliveries.error;
    const testsByReport = new Map(
      (testDeliveries.data ?? []).map((row) => [row.report_id, row])
    );
    const timezone = await timezonePromise;
    const data = (listResult.data ?? []).map((row) => {
      const reportMonth = resolveReportMonth(row, timezone);
      return {
        ...row,
        report_month: reportMonth?.month ?? null,
        report_month_estimated: reportMonth?.estimated ?? false,
        test_delivery: row.id ? (testsByReport.get(row.id) ?? null) : null,
        creator_name:
          row.creator_display_name ??
          row.creator_full_name ??
          row.creator_email ??
          null,
        user_name:
          row.user_display_name ?? row.user_full_name ?? row.user_email ?? null,
      };
    });

    return NextResponse.json({
      counts,
      categoryCounts,
      data,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      summaryPartial,
      total: listResult.count,
      workspace: workspaceResult.data,
    });
  } catch (error) {
    if (error instanceof ReportListLimitError) {
      return NextResponse.json({ message: error.message }, { status: 422 });
    }
    console.error('Error in reports GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const parsed = CreateReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const actorAuthUid = await resolveRequestActorAuthUid(request);
    if (!actorAuthUid) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!permissions.containsPermission('create_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const actorLink = await getWorkspaceUserLinkForUser(wsId, actorAuthUid, {
      authorizationClient: sbAdmin,
    });
    if (!actorLink?.virtual_user_id) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const [user, group] = await Promise.all([
      sbAdmin
        .from('workspace_users')
        .select('id')
        .eq('id', parsed.data.user_id)
        .eq('ws_id', permissions.wsId)
        .maybeSingle(),
      sbAdmin
        .from('workspace_user_groups')
        .select('id')
        .eq('id', parsed.data.group_id)
        .eq('ws_id', permissions.wsId)
        .maybeSingle(),
    ]);
    if (user.error) throw user.error;
    if (group.error) throw group.error;
    if (!user.data || !group.data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const privateDb = sbAdmin.schema('private');
    let existingQuery = privateDb
      .from('external_user_monthly_reports')
      .select('id')
      .eq('user_id', parsed.data.user_id)
      .eq('group_id', parsed.data.group_id);
    existingQuery =
      parsed.data.period_start && parsed.data.period_end
        ? existingQuery
            .eq('cadence', parsed.data.cadence)
            .eq('period_start', parsed.data.period_start)
            .eq('period_end', parsed.data.period_end)
        : existingQuery.eq('title', parsed.data.title);
    const existing = await existingQuery.limit(1).maybeSingle();
    if (existing.data) {
      return NextResponse.json(
        { message: 'Duplicate report exists' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const result = await privateDb
      .from('external_user_monthly_reports')
      .insert({
        ...parsed.data,
        generation_status:
          parsed.data.generation_mode === 'ai' ? 'draft' : 'ready',
        creator_id: actorLink.virtual_user_id,
        updated_by: actorLink.virtual_user_id,
        created_at: now,
        updated_at: now,
        report_approval_status: 'PENDING',
      })
      .select('id')
      .single();
    if (result.error) throw result.error;
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error in reports POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
