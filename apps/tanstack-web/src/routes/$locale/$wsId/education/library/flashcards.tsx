import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Plus, SwatchBook } from '@tuturuuu/icons';
import {
  getWorkspaceFlashcards,
  type ListWorkspaceFlashcardsResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceFlashcard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { getWorkspaceFlashcardColumns } from '@/components/education/flashcards/columns';
import FlashcardForm from '@/components/education/flashcards/form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type LibraryFlashcardsData = {
  count: number;
  flashcards: ListWorkspaceFlashcardsResponse['data'];
  workspaceId: string;
};

type LibraryFlashcardsSearch = {
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

const loadLibraryFlashcards = createServerFn({ method: 'GET' })
  .validator(
    (data: { wsId: string; page?: number; pageSize?: number; q?: string }) =>
      data
  )
  .handler(
    async ({
      data,
    }): Promise<{
      data: LibraryFlashcardsData['flashcards'];
      count: number;
    }> => {
      const result = await getWorkspaceFlashcards(
        data.wsId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/library/flashcards'
)({
  component: LibraryFlashcardsRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (
    search: Record<string, unknown>
  ): LibraryFlashcardsSearch => ({
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
        'Manage shared flashcards in your workspace education library.',
      locale,
      title: 'Library Flashcards',
    });
  },
  loader: async ({ params, deps }): Promise<LibraryFlashcardsData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/library/flashcards`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const { count, data } = await loadLibraryFlashcards({
      data: {
        wsId: workspace.workspaceId,
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
      },
    });

    return { count, flashcards: data, workspaceId: workspace.workspaceId };
  },
});

function LibraryFlashcardsRoutePage() {
  const data = Route.useLoaderData() as LibraryFlashcardsData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.library_flashcards')}
        description={t('ws-flashcards.description')}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-sky/20 bg-dynamic-sky/10 px-3 py-1 font-medium text-dynamic-sky text-xs">
            <SwatchBook className="h-3.5 w-3.5" />
            {t('workspace-education-tabs.library')}
          </div>
        }
        secondaryAction={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/${wsId}/education/library/quiz-sets`}>
              {t('workspace-education-tabs.library_quiz_sets')}
            </Link>
          </Button>
        }
        primaryAction={
          <ModifiableDialogTrigger
            title={t('ws-flashcards.singular')}
            createDescription={t('ws-flashcards.create_description')}
            form={<FlashcardForm wsId={data.workspaceId} />}
            trigger={
              <Button className="h-11 rounded-2xl bg-foreground px-5 text-background">
                <Plus className="h-4 w-4" />
                {t('ws-flashcards.create')}
              </Button>
            }
          />
        }
      />

      <EducationKpiStrip
        items={[
          {
            label: t('ws-flashcards.plural'),
            tone: 'sky',
            value: data.count,
          },
        ]}
      />

      <EducationContentSurface pattern>
        <CustomDataTable
          data={data.flashcards as unknown as WorkspaceFlashcard[]}
          columnGenerator={getWorkspaceFlashcardColumns}
          namespace="flashcard-data-table"
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
