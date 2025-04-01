import ProblemCardSkeleton from './ProblemCardSkeleton';
import CreateProblemDialog from './createProblemDialog';
import ProblemCard from './problemCard';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

export default async function ProblemsPage() {
  const t = await getTranslations('nova');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex items-center justify-between">
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

      <Suspense fallback={<ProblemCardSkeleton />}>
        <ProblemsList />
      </Suspense>
    </div>
  );
}

async function ProblemsList() {
  const problems = await fetchProblems();

  return problems.length > 0 ? (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {problems.map((problem) => (
        <ProblemCard key={problem.id} problem={problem} />
      ))}
    </div>
  ) : (
    <div className="col-span-full text-center">
      <p className="text-muted-foreground">No problems available.</p>
    </div>
  );
}

async function fetchProblems() {
  const database = await createClient();
  const { data: problems, error } = await database
    .from('nova_problems')
    .select('*, test_cases:nova_problem_test_cases(*)');

  if (error) {
    console.error('Error fetching problems:', error.message);
    return [];
  }

  return problems;
}
