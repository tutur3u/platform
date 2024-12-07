import { geQuizSetColumns } from './columns';
import QuizForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { type WorkspaceQuizSet } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
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
        pluralTitle={t('ws-quizzes.plural')}
        singularTitle={t('ws-quizzes.singular')}
        description={t('ws-quizzes.description')}
        createTitle={t('ws-quizzes.create')}
        createDescription={t('ws-quizzes.create_description')}
        form={<QuizForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={quizSets}
        columnGenerator={geQuizSetColumns}
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
