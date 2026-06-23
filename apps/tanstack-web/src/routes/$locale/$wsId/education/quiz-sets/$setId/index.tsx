import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getQuizSetQuizzes,
  type ListWorkspaceQuizzesResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceQuiz } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { getWorkspaceQuizColumns } from '@/components/education/quiz-set-quizzes/columns';
import QuizForm from '@/components/education/quiz-set-quizzes/form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type QuizSetQuizzesData = {
  count: number;
  quizzes: ListWorkspaceQuizzesResponse['data'];
  workspaceId: string;
};

type QuizSetQuizzesSearch = {
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

const loadQuizSetQuizzes = createServerFn({ method: 'GET' })
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
    }): Promise<{ data: QuizSetQuizzesData['quizzes']; count: number }> => {
      const result = await getQuizSetQuizzes(
        data.wsId,
        data.setId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/quiz-sets/$setId/'
)({
  component: QuizSetQuizzesRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): QuizSetQuizzesSearch => ({
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
      description: 'Manage the quizzes in this quiz set.',
      locale,
      title: 'Set Details',
    });
  },
  loader: async ({ params, deps }): Promise<QuizSetQuizzesData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/quiz-sets/${params.setId}`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const page = deps.page ?? 1;
    const pageSize = deps.pageSize ?? 10;
    const { count, data } = await loadQuizSetQuizzes({
      data: {
        wsId: workspace.workspaceId,
        setId: params.setId,
        page,
        pageSize,
        q: deps.q,
      },
    });

    return { count, quizzes: data, workspaceId: workspace.workspaceId };
  },
});

function QuizSetQuizzesRoutePage() {
  const data = Route.useLoaderData() as QuizSetQuizzesData | undefined;
  const { setId } = Route.useParams();
  const t = useTranslations('ws-quizzes');

  if (!data) {
    throw notFound();
  }

  return (
    <>
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        description={t('description')}
        createTitle={t('create')}
        createDescription={t('create_description')}
        form={<QuizForm wsId={data.workspaceId} setId={setId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data.quizzes as unknown as WorkspaceQuiz[]}
        columnGenerator={getWorkspaceQuizColumns}
        namespace="quiz-data-table"
        count={data.count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}
