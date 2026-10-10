import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '../../../features/reports/report-limits';
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
});

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
        parsed.data.periodStart > parsed.data.periodEnd)
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
        total: 0,
        workspace: { id: wsId, timezone: null },
      });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const from = (parsed.data.page - 1) * parsed.data.pageSize;

    const sortColumn = getPeriodicReportSortColumn(parsed.data.sortBy);
    const buildListQuery = (
      useSmartSearch: boolean,
      offset: number,
      limit: number,
      cadence = parsed.data.cadence
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
        .select('*', { count: 'exact' })
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
      if (parsed.data.periodStart)
        query = query.gte('period_end', parsed.data.periodStart);
      if (parsed.data.periodEnd)
        query = query.lte('period_start', parsed.data.periodEnd);
      if (parsed.data.stage)
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

    const workspacePromise = sbAdmin
      .from('workspaces')
      .select('id, timezone')
      .eq('id', wsId)
      .single();
    const smartSearch = Boolean(parsed.data.q);
    const collect = async (useSmartSearch: boolean) => {
      if (!useSmartSearch || parsed.data.cadence !== 'all') {
        return collectReportList((offset, limit) =>
          buildListQuery(useSmartSearch, offset, limit)
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
            (offset, limit) => buildListQuery(true, offset, limit, cadence),
            MAX_REPORT_LIST_ROWS - rows.length
          ))
        );
      }
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new Error('Report scope changed. Refresh reports.');
      }
      return sortReportList(
        rows,
        sortColumn,
        parsed.data.sortDirection === 'asc'
      );
    };
    const rowsPromise = collect(smartSearch).catch((error: unknown) => {
      if (smartSearch && isMissingReportSearchRpc(error)) return collect(false);
      throw error;
    });
    const [allRows, workspaceResult] = await Promise.all([
      rowsPromise,
      workspacePromise,
    ]);
    if (workspaceResult.error) throw workspaceResult.error;
    const filteredRows = parsed.data.category
      ? allRows.filter(
          (row) => periodicDeliveryCategory(row) === parsed.data.category
        )
      : allRows;
    const { counts, categoryCounts } = summarizeReportList(filteredRows);
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
    const data = (listResult.data ?? []).map((row) => ({
      ...row,
      test_delivery: row.id ? (testsByReport.get(row.id) ?? null) : null,
      creator_name:
        row.creator_display_name ??
        row.creator_full_name ??
        row.creator_email ??
        null,
      user_name:
        row.user_display_name ?? row.user_full_name ?? row.user_email ?? null,
    }));

    return NextResponse.json({
      counts,
      categoryCounts,
      data,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
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
