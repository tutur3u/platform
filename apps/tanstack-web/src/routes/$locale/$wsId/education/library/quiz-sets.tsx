import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Layers, Plus } from '@tuturuuu/icons';
import {
  getWorkspaceQuizSets,
  type ListWorkspaceQuizSetsResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceQuizSet } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { getQuizSetColumns } from '@/components/education/quiz-sets/columns';
import QuizForm from '@/components/education/quiz-sets/form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type LibraryQuizSetsData = {
  count: number;
  quizSets: ListWorkspaceQuizSetsResponse['data'];
  workspaceId: string;
};

type LibraryQuizSetsSearch = {
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

const loadLibraryQuizSets = createServerFn({ method: 'GET' })
  .validator(
    (data: { wsId: string; page?: number; pageSize?: number; q?: string }) =>
      data
  )
  .handler(
    async ({
      data,
    }): Promise<{ data: LibraryQuizSetsData['quizSets']; count: number }> => {
      const result = await getWorkspaceQuizSets(
        data.wsId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/library/quiz-sets'
)({
  component: LibraryQuizSetsRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): LibraryQuizSetsSearch => ({
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
        'Manage shared quiz sets in your workspace education library.',
      locale,
      title: 'Library Quiz Sets',
    });
  },
  loader: async ({ params, deps }): Promise<LibraryQuizSetsData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/library/quiz-sets`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const page = deps.page ?? 1;
    const pageSize = deps.pageSize ?? 10;
    const { count, data } = await loadLibraryQuizSets({
      data: {
        wsId: workspace.workspaceId,
        page,
        pageSize,
        q: deps.q,
      },
    });

    return { count, quizSets: data, workspaceId: workspace.workspaceId };
  },
});

function LibraryQuizSetsRoutePage() {
  const data = Route.useLoaderData() as LibraryQuizSetsData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  // Legacy maps each row to a detail href consumed by the quiz-set columns.
  const quizSets = data.quizSets.map((quizSet) => ({
    ...quizSet,
    href: `/${wsId}/education/quiz-sets/${quizSet.id}`,
  }));

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.library_quiz_sets')}
        description={t('ws-quiz-sets.description')}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-lime/20 bg-dynamic-lime/10 px-3 py-1 font-medium text-dynamic-lime text-xs">
            <Layers className="h-3.5 w-3.5" />
            {t('workspace-education-tabs.library')}
          </div>
        }
        secondaryAction={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/${wsId}/education/library/quizzes`}>
              {t('workspace-education-tabs.library_quizzes')}
            </Link>
          </Button>
        }
        primaryAction={
          <ModifiableDialogTrigger
            title={t('ws-quiz-sets.singular')}
            createDescription={t('ws-quiz-sets.create_description')}
            form={<QuizForm wsId={data.workspaceId} />}
            trigger={
              <Button className="h-11 rounded-2xl bg-foreground px-5 text-background">
                <Plus className="h-4 w-4" />
                {t('ws-quiz-sets.create')}
              </Button>
            }
          />
        }
      />

      <EducationKpiStrip
        items={[
          {
            label: t('ws-quiz-sets.plural'),
            tone: 'green',
            value: data.count,
          },
        ]}
      />

      <EducationContentSurface pattern>
        <CustomDataTable
          data={quizSets as unknown as WorkspaceQuizSet[]}
          columnGenerator={getQuizSetColumns}
          namespace="quiz-set-data-table"
          count={data.count}
          extraData={{ wsId }}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </EducationContentSurface>
    </div>
  );
}
