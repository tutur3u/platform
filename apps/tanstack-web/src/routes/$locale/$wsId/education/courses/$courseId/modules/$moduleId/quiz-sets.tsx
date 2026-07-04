import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getCourseModuleQuizSets,
  type ListCourseModuleQuizSetsResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceQuizSet } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { getQuizSetColumns } from '@/components/education/course-module-quiz-sets/columns';
import CourseModuleForm from '@/components/education/course-module-quiz-sets/form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type ModuleQuizSetsData = {
  count: number;
  quizSets: ListCourseModuleQuizSetsResponse['data'];
  workspaceId: string;
};

type ModuleQuizSetsSearch = {
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

const loadModuleQuizSets = createServerFn({ method: 'GET' })
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
    }): Promise<{ data: ModuleQuizSetsData['quizSets']; count: number }> => {
      const result = await getCourseModuleQuizSets(
        data.wsId,
        data.moduleId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId/modules/$moduleId/quiz-sets'
)({
  component: ModuleQuizSetsRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): ModuleQuizSetsSearch => ({
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
        'Manage Quiz Sets in the Module area of your Tuturuuu workspace.',
      locale,
      title: 'Quiz Sets',
    });
  },
  loader: async ({ params, deps }): Promise<ModuleQuizSetsData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/courses/${params.courseId}/modules/${params.moduleId}/quiz-sets`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const { count, data } = await loadModuleQuizSets({
      data: {
        wsId: workspace.workspaceId,
        moduleId: params.moduleId,
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
      },
    });

    return { count, quizSets: data, workspaceId: workspace.workspaceId };
  },
});

function ModuleQuizSetsRoutePage() {
  const data = Route.useLoaderData() as ModuleQuizSetsData | undefined;
  const { wsId, courseId, moduleId } = Route.useParams();
  const t = useTranslations('ws-quiz-sets');

  if (!data) {
    throw notFound();
  }

  // Legacy enriches each row with ws_id + a quiz-set detail href.
  const quizSets = data.quizSets.map((quizSet) => ({
    ...quizSet,
    ws_id: data.workspaceId,
    href: `/${wsId}/education/quiz-sets/${quizSet.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        createTitle={t('create')}
        createDescription={t('create_description')}
        form={<CourseModuleForm wsId={data.workspaceId} moduleId={moduleId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={quizSets as unknown as WorkspaceQuizSet[]}
        columnGenerator={getQuizSetColumns}
        extraData={{ wsId: data.workspaceId, courseId, moduleId }}
        namespace="course-data-table"
        count={data.count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}
