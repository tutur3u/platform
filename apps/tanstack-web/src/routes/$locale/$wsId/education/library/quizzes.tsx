import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { ClipboardCheck, Plus } from '@tuturuuu/icons';
import {
  getWorkspaceQuizzes,
  type ListWorkspaceQuizzesResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceQuiz } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { getWorkspaceQuizColumns } from '@/components/education/quizzes/columns';
import QuizForm from '@/components/education/quizzes/form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type LibraryQuizzesData = {
  count: number;
  quizzes: ListWorkspaceQuizzesResponse['data'];
  workspaceId: string;
};

type LibraryQuizzesSearch = {
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

const loadLibraryQuizzes = createServerFn({ method: 'GET' })
  .validator(
    (data: { wsId: string; page?: number; pageSize?: number; q?: string }) =>
      data
  )
  .handler(
    async ({
      data,
    }): Promise<{ data: LibraryQuizzesData['quizzes']; count: number }> => {
      const result = await getWorkspaceQuizzes(
        data.wsId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/library/quizzes'
)({
  component: LibraryQuizzesRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): LibraryQuizzesSearch => ({
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
      description: 'Manage shared quizzes in your workspace education library.',
      locale,
      title: 'Library Quizzes',
    });
  },
  loader: async ({ params, deps }): Promise<LibraryQuizzesData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/library/quizzes`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const page = deps.page ?? 1;
    const pageSize = deps.pageSize ?? 10;
    const { count, data } = await loadLibraryQuizzes({
      data: {
        wsId: workspace.workspaceId,
        page,
        pageSize,
        q: deps.q,
      },
    });

    return { count, quizzes: data, workspaceId: workspace.workspaceId };
  },
});

function LibraryQuizzesRoutePage() {
  const data = Route.useLoaderData() as LibraryQuizzesData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  const quizzes = data.quizzes.map((quiz) => ({
    ...quiz,
    ws_id: data.workspaceId,
  }));

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.library_quizzes')}
        description={t('ws-quizzes.description')}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-1 font-medium text-dynamic-green text-xs">
            <ClipboardCheck className="h-3.5 w-3.5" />
            {t('workspace-education-tabs.library')}
          </div>
        }
        secondaryAction={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/${wsId}/education/courses`}>
              {t('workspace-education-tabs.courses')}
            </Link>
          </Button>
        }
        primaryAction={
          <ModifiableDialogTrigger
            title={t('ws-quizzes.singular')}
            createDescription={t('ws-quizzes.create_description')}
            form={<QuizForm wsId={data.workspaceId} />}
            trigger={
              <Button className="h-11 rounded-2xl bg-foreground px-5 text-background">
                <Plus className="h-4 w-4" />
                {t('ws-quizzes.create')}
              </Button>
            }
          />
        }
      />

      <EducationKpiStrip
        items={[
          {
            label: t('ws-quizzes.plural'),
            tone: 'green',
            value: data.count,
          },
        ]}
      />

      <EducationContentSurface pattern>
        <CustomDataTable
          data={quizzes as unknown as WorkspaceQuiz[]}
          columnGenerator={getWorkspaceQuizColumns}
          namespace="quiz-data-table"
          count={data.count}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </EducationContentSurface>
    </div>
  );
}
