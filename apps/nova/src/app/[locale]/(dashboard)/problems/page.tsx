import ProblemCard from './problemCard';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NovaProblem } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function ProblemsPage() {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();

  if (!user?.id) {
    redirect('/login');
  }

  const problems = await fetchProblems();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Prompt Engineering Problems</h1>
        <Link href="/problems/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Problem
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {problems.length > 0 ? (
          problems.map((problem: NovaProblem) => (
            <ProblemCard key={problem.id} problem={problem} />
          ))
        ) : (
          <p className="text-gray-500">No problems available.</p>
        )}
      </div>
    </div>
  );
}

async function fetchProblems(): Promise<NovaProblem[]> {
  const database = await createClient();
  try {
    const { data: problems, error } = await database
      .from('nova_problems')
      .select('*');

    if (error) {
      console.error('Error fetching problems:', error.message);
      return [];
    }

    return problems;
  } catch (error) {
    console.error('Unexpected error fetching problems:', error);
    return [];
  }
}
