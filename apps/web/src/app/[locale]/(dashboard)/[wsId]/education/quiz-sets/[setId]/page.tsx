import { getWorkspaceQuizColumns } from './columns';
import QuizForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { WorkspaceQuiz } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { ListPlus } from 'lucide-react';
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
    setId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceQuizzesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId, setId } = await params;

  const { data, count } = await getData(setId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-quizzes.plural')}
        singularTitle={t('ws-quizzes.singular')}
        description={t('ws-quizzes.description')}
        createTitle={t('ws-quizzes.create')}
        createDescription={t('ws-quizzes.create_description')}
        form={<QuizForm wsId={wsId} />}
        secondaryTriggerIcon={<ListPlus />}
        secondaryTriggerTitle={`${t('ws-quiz-sets.link-quizzes')} `}
        secondaryTitle={t('ws-roles.default_permissions')}
        secondaryDescription={t('ws-roles.default_permissions_description')}
        showSecondaryTrigger
        showCustomSecondaryTrigger
      />
      <Separator className="my-4" />
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
    </>
  );
}

async function getData(
  setId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('quiz_set_quizzes')
    .select('...workspace_quizzes(*)', {
      count: 'exact',
    })
    .eq('set_id', setId)
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
    return getData(setId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: WorkspaceQuiz[]; count: number };
}
