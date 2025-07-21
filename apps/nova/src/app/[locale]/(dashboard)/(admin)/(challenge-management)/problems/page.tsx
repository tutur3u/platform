import ProblemCardSkeleton from './ProblemCardSkeleton';
import { getProblemColumns } from './columns';
import CreateProblemDialog from './createProblemDialog';
import ChallengeFilter from './filter';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  challengeId?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: Props) {
  const t = await getTranslations('nova');

  // Get available challenges for the filter
  const { challenges } = await getChallenges();

  // Get the challenge ID filter from URL
  const challengeId = (await searchParams).challengeId;

  const { problemsData, problemsCount } = await getProblemsData({
    q: (await searchParams).q,
    page: (await searchParams).page,
    pageSize: (await searchParams).pageSize,
    challengeId,
  });

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-0">
        <h1 className="text-3xl font-bold">{t('problems')}</h1>
        <CreateProblemDialog
          trigger={
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t('create-problem')}
            </Button>
          }
        />
      </div>

      <div className="mb-4">
        <ChallengeFilter
          challenges={challenges}
          initialChallengeId={challengeId}
        />
      </div>

      <Separator className="my-4" />

      <Suspense fallback={<ProblemCardSkeleton />}>
        <CustomDataTable
          data={problemsData}
          columnGenerator={getProblemColumns}
          count={problemsCount}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
          extraData={{ filteredChallengeId: challengeId }}
        />
      </Suspense>
    </div>
  );
}

async function getChallenges() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nova_challenges')
    .select('id, title')
    .order('title');

  if (error) {
    console.error('Error fetching challenges:', error);
    return { challenges: [] };
  }

  return { challenges: data || [] };
}

async function getProblemsData({
  q,
  page = '1',
  pageSize = '10',
  challengeId,
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  challengeId?: string;
} = {}) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('nova_problems')
    .select(
      `*,
    test_cases:nova_problem_test_cases(*),
    challenge:nova_challenges(id, title)
    `,
      { count: 'exact' }
    )
    .order('title', { ascending: false });

  if (challengeId) {
    queryBuilder.eq('challenge_id', challengeId);
  }

  if (q) queryBuilder.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

  // Add filter by challenge ID if provided

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder.range(start, end);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    return getProblemsData({ q, page, pageSize });
  }

  return {
    problemsData: data || [],
    problemsCount: count || 0,
  };
}
