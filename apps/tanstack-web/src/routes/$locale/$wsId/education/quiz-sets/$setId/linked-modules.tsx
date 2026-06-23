import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getQuizSetLinkedModules,
  type ListAllWorkspaceCourseModulesResponse,
  type ListQuizSetLinkedModulesResponse,
  listAllWorkspaceCourseModules,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceCourseModule } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { getWorkspaceCourseModuleColumns } from '@/components/education/quiz-set-linked-modules/columns';
import { QuizsetModuleLinker } from '@/components/education/quiz-set-linked-modules/linker';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type LinkedModulesData = {
  allModules: ListAllWorkspaceCourseModulesResponse['data'];
  count: number;
  linkedModules: ListQuizSetLinkedModulesResponse['data'];
  workspaceId: string;
};

type LinkedModulesSearch = {
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

const loadLinkedModules = createServerFn({ method: 'GET' })
  .validator(
    (data: {
      wsId: string;
      setId: string;
      page?: number;
      pageSize?: number;
      q?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{
      allModules: LinkedModulesData['allModules'];
      linkedModules: LinkedModulesData['linkedModules'];
      count: number;
    }> => {
      const auth = withForwardedInternalApiAuth(getRequestHeaders());
      const [linked, all] = await Promise.all([
        getQuizSetLinkedModules(
          data.wsId,
          data.setId,
          { page: data.page, pageSize: data.pageSize, q: data.q },
          auth
        ),
        listAllWorkspaceCourseModules(
          data.wsId,
          { page: data.page, pageSize: data.pageSize, q: data.q },
          auth
        ),
      ]);

      return {
        allModules: all.data,
        count: linked.count,
        linkedModules: linked.data,
      };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/quiz-sets/$setId/linked-modules'
)({
  component: LinkedModulesRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): LinkedModulesSearch => ({
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
      description: 'Manage the course modules linked to this quiz set.',
      locale,
      title: 'Linked Modules',
    });
  },
  loader: async ({ params, deps }): Promise<LinkedModulesData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/quiz-sets/${params.setId}/linked-modules`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const { allModules, count, linkedModules } = await loadLinkedModules({
      data: {
        wsId: workspace.workspaceId,
        setId: params.setId,
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
      },
    });

    return {
      allModules,
      count,
      linkedModules,
      workspaceId: workspace.workspaceId,
    };
  },
});

function LinkedModulesRoutePage() {
  const data = Route.useLoaderData() as LinkedModulesData | undefined;
  const { wsId, setId } = Route.useParams();
  const t = useTranslations('ws-course-modules');

  if (!data) {
    throw notFound();
  }

  const modules = data.linkedModules.map((module) => ({
    ...module,
    ws_id: data.workspaceId,
    href: `/${wsId}/education/courses/${module.group_id}/modules/${module.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        description={t('description')}
        createTitle={t('create')}
        createDescription={t('create_description')}
        action={
          <QuizsetModuleLinker
            wsId={data.workspaceId}
            setId={setId}
            data={
              data.allModules.map((module) => ({
                ...module,
                selected: modules.some((linked) => linked.id === module.id),
              })) as unknown as (Partial<WorkspaceCourseModule> & {
                selected?: boolean;
              })[]
            }
          />
        }
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={modules as unknown as Partial<WorkspaceCourseModule>[]}
        columnGenerator={getWorkspaceCourseModuleColumns}
        extraData={{ wsId: data.workspaceId, setId }}
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
