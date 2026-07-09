import { Layers, Plus } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceQuizSet } from '@tuturuuu/types';
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
import { getQuizSetColumns } from '../../quiz-sets/columns';
import QuizForm from '../../quiz-sets/form';

export const metadata: Metadata = {
  title: 'Library Quiz Sets',
  description: 'Manage shared quiz sets in your workspace education library.',
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

export default async function WorkspaceLibraryQuizSetsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId: routeWsId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);

  const { data, count } = await getData(resolvedWsId, await searchParams);
  const quizSets = data.map((quizSet) => ({
    ...quizSet,
    href: `/${routeWsId}/education/quiz-sets/${quizSet.id}`,
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
            <Link href={`/${routeWsId}/education/library/quizzes`}>
              {t('workspace-education-tabs.library_quizzes')}
            </Link>
          </Button>
        }
        primaryAction={
          <ModifiableDialogTrigger
            title={t('ws-quiz-sets.singular')}
            createDescription={t('ws-quiz-sets.create_description')}
            form={<QuizForm wsId={resolvedWsId} />}
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
            value: count,
          },
        ]}
      />

      <EducationContentSurface pattern>
        <CustomDataTable
          data={quizSets}
          columnGenerator={getQuizSetColumns}
          namespace="quiz-set-data-table"
          count={count}
          extraData={{ wsId: routeWsId }}
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
    .from('workspace_quiz_sets')
    .select(
      '*, linked_modules:course_module_quiz_sets(...workspace_course_modules(module_id:id, module_name:name, ...workspace_courses(course_id:id, course_name:name)))',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

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

  return { data, count } as { data: WorkspaceQuizSet[]; count: number };
}
