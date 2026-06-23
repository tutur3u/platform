import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { ListTodo } from '@tuturuuu/icons';
import {
  getWorkspaceQuizzes,
  type ListWorkspaceQuizzesResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceQuiz } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { getWorkspaceQuizColumns } from '@/components/education/quizzes/columns';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type ModuleQuizzesData = {
  count: number;
  quizzes: ListWorkspaceQuizzesResponse['data'];
  workspaceId: string;
};

type ModuleQuizzesSearch = {
  page?: number;
  pageSize?: number;
  q?: string;
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const loadModuleQuizzes = createServerFn({ method: 'GET' })
  .validator(
    (data: {
      wsId: string;
      moduleId: string;
      page?: number;
      pageSize?: number;
      q?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{ data: ModuleQuizzesData['quizzes']; count: number }> => {
      const result = await getWorkspaceQuizzes(
        data.wsId,
        {
          moduleId: data.moduleId,
          page: data.page,
          pageSize: data.pageSize,
          q: data.q,
        },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId/modules/$moduleId/quizzes/'
)({
  component: ModuleQuizzesRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): ModuleQuizzesSearch => ({
    page: toPositiveInt(search.page),
    pageSize: toPositiveInt(search.pageSize),
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Quizzes in the Module area of your Tuturuuu workspace.',
      locale,
      title: 'Quizzes',
    });
  },
  loader: async ({ params, deps }): Promise<ModuleQuizzesData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/courses/${params.courseId}/modules/${params.moduleId}/quizzes`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const page = deps.page ?? 1;
    const pageSize = deps.pageSize ?? 10;
    const { count, data } = await loadModuleQuizzes({
      data: {
        wsId: workspace.workspaceId,
        moduleId: params.moduleId,
        page,
        pageSize,
        q: deps.q,
      },
    });

    return { count, quizzes: data, workspaceId: workspace.workspaceId };
  },
});

function ModuleQuizzesRoutePage() {
  const data = Route.useLoaderData() as ModuleQuizzesData | undefined;
  const { courseId, moduleId, wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  const quizzes = data.quizzes.map((quiz) => ({
    ...quiz,
    ws_id: data.workspaceId,
  }));

  return (
    <div className="grid gap-4">
      <FeatureSummary
        createDescription={t('ws-quizzes.create_description')}
        createTitle={t('ws-quizzes.create_manually')}
        href={`/${wsId}/education/courses/${courseId}/modules/${moduleId}/quizzes/new`}
        pluralTitle={t('ws-quizzes.plural')}
        singularTitle={t('ws-quizzes.singular')}
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 font-bold text-lg md:text-2xl">
              <ListTodo className="h-5 w-5" />
              {t('ws-quizzes.plural')}
            </h1>
          </div>
        }
      />

      <Separator className="my-2" />

      <CustomDataTable
        columnGenerator={getWorkspaceQuizColumns}
        count={data.count}
        data={quizzes as unknown as WorkspaceQuiz[]}
        defaultVisibility={{
          created_at: false,
          id: false,
        }}
        namespace="quiz-data-table"
      />
    </div>
  );
}
