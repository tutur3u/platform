
import { getQuizSetColumns } from '@/app/[locale]/(dashboard)/education/quiz-sets/columns';
import QuizForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type WorkspaceQuizSet } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceQuizzesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  const { data, count } = await getData(wsId, await searchParams);

  const quizSets = data.map((quizSet) => ({
    ...quizSet,
    href: `/${wsId}/education/quiz-sets/${quizSet.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-quiz-sets.plural')}
        singularTitle={t('ws-quiz-sets.singular')}
        description={t('ws-quiz-sets.description')}
        createTitle={t('ws-quiz-sets.create')}
        createDescription={t('ws-quiz-sets.create_description')}
        form={<QuizForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={quizSets}
        columnGenerator={getQuizSetColumns}
        namespace="quiz-set-data-table"
        count={count}
        extraData={{ wsId }}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
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
  const supabase = await createClient();

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
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
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