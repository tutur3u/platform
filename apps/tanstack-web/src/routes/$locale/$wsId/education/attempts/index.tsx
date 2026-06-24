import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type ListWorkspaceEducationAttemptsResponse,
  listWorkspaceEducationAttempts,
  type WorkspaceEducationAttemptListQuery,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { EducationAttemptsReview } from '@/components/education/attempts/attempts-review';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

const EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION = 'view_user_groups_reports';

type AttemptsRouteData = ListWorkspaceEducationAttemptsResponse & {
  workspaceId: string;
};

type AttemptsSearch = WorkspaceEducationAttemptListQuery;

function toPositiveInt(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'all' ? trimmed : undefined;
}

function toStatus(value: unknown): AttemptsSearch['status'] | undefined {
  return value === 'completed' || value === 'incomplete' || value === 'all'
    ? value
    : undefined;
}

function toSortBy(value: unknown): AttemptsSearch['sortBy'] | undefined {
  return value === 'duration' || value === 'score' || value === 'newest'
    ? value
    : undefined;
}

function toSortDirection(
  value: unknown
): AttemptsSearch['sortDirection'] | undefined {
  return value === 'asc' || value === 'desc' ? value : undefined;
}

const loadEducationAttempts = createServerFn({ method: 'GET' })
  .validator(
    (data: { query: WorkspaceEducationAttemptListQuery; wsId: string }) => data
  )
  .handler(
    async ({ data }): Promise<ListWorkspaceEducationAttemptsResponse> =>
      listWorkspaceEducationAttempts(
        data.wsId,
        data.query,
        withForwardedInternalApiAuth(getRequestHeaders())
      )
  );

export const Route = createFileRoute('/$locale/$wsId/education/attempts/')({
  component: EducationAttemptsRoutePage,
  validateSearch: (search: Record<string, unknown>): AttemptsSearch => ({
    dateFrom: toOptionalString(search.dateFrom),
    dateTo: toOptionalString(search.dateTo),
    learnerId: toOptionalString(search.learnerId),
    page: toPositiveInt(search.page),
    pageSize: toPositiveInt(search.pageSize),
    setId: toOptionalString(search.setId),
    sortBy: toSortBy(search.sortBy),
    sortDirection: toSortDirection(search.sortDirection),
    status: toStatus(search.status),
  }),
  loaderDeps: ({ search }) => search,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review quiz attempts and learner outcomes in your workspace.',
      locale,
      title: 'Attempts',
    });
  },
  loader: async ({ params, deps }): Promise<AttemptsRouteData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/attempts`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const canViewAttempts = await hasWorkspacePermission({
      data: {
        permission: EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION,
        wsId: workspace.workspaceId,
      },
    });
    if (!canViewAttempts) {
      throw notFound();
    }

    const page = deps.page ?? 1;
    const pageSize = Math.min(Math.max(deps.pageSize ?? 20, 1), 100);
    const attempts = await loadEducationAttempts({
      data: {
        query: {
          ...deps,
          page,
          pageSize,
        },
        wsId: workspace.workspaceId,
      },
    });

    return {
      ...attempts,
      workspaceId: workspace.workspaceId,
    };
  },
});

function EducationAttemptsRoutePage() {
  const data = Route.useLoaderData() as AttemptsRouteData | undefined;
  const { wsId } = Route.useParams();
  const search = Route.useSearch();

  if (!data) {
    throw notFound();
  }

  return <EducationAttemptsReview data={data} search={search} wsId={wsId} />;
}
