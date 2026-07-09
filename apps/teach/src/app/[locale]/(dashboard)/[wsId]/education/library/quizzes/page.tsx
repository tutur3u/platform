import { ClipboardCheck, Plus } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceQuiz } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { getWorkspaceQuizColumns } from '../../quizzes/columns';
import QuizForm from '../../quizzes/form';

export const metadata: Metadata = {
  title: 'Library Quizzes',
  description: 'Manage shared quizzes in your workspace education library.',
};

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceLibraryQuizzesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId: routeWsId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const { data, count } = await getData(resolvedWsId, await searchParams);

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
            <Link href={`/${routeWsId}/education/courses`}>
              {t('workspace-education-tabs.courses')}
            </Link>
          </Button>
        }
        primaryAction={
          <ModifiableDialogTrigger
            title={t('ws-quizzes.singular')}
            createDescription={t('ws-quizzes.create_description')}
            form={<QuizForm wsId={resolvedWsId} />}
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
            value: count,
          },
        ]}
      />

      <EducationContentSurface pattern>
        <CustomDataTable
          data={data}
          columnGenerator={getWorkspaceQuizColumns}
          namespace="quiz-data-table"
          count={count}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </EducationContentSurface>
    </div>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createAdminClient();

  const queryBuilder = supabase
    .from('workspace_quizzes')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('question', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: WorkspaceQuiz[]; count: number };
}
