import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { requireQuizSetPageAccess } from '@/lib/quiz-set-page-access';
import { getWorkspaceQuizColumns } from './columns';
import { getQuizSetQuizzes } from './data';
import QuizForm from './form';

export const metadata: Metadata = {
  title: 'Set Details',
  description:
    'Manage Set Details in the Quiz Sets area of your Tuturuuu workspace.',
};

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
  const { wsId: routeWsId, setId } = await params;
  const { resolvedWsId } = await requireQuizSetPageAccess(routeWsId, setId);

  const { data, count } = await getQuizSetQuizzes(
    resolvedWsId,
    setId,
    await searchParams
  );

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-quizzes.plural')}
        singularTitle={t('ws-quizzes.singular')}
        description={t('ws-quizzes.description')}
        createTitle={t('ws-quizzes.create')}
        createDescription={t('ws-quizzes.create_description')}
        form={<QuizForm wsId={resolvedWsId} setId={setId} />}
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
