'use client';

// Import the components we need for the problem page
import ProblemComponent from '../../../challenges/[challengeId]/problem-component';
import PromptComponent from '../../../challenges/[challengeId]/prompt-component';
import TestCaseComponent from '../../../challenges/[challengeId]/test-case-component';
import { createClient } from '@tuturuuu/supabase/next/client';
import { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ExtendedNovaProblem = NovaProblem & {
  testcases: NovaProblemTestCase[];
};

interface Props {
  params: Promise<{
    problemId: string;
  }>;
}

export default function ProblemPage({ params }: Props) {
  const router = useRouter();

  const [problem, setProblem] = useState<ExtendedNovaProblem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProblem = async () => {
      setLoading(true);
      try {
        const { problemId } = await params;
        const problemData = await getProblem(problemId);
        setProblem(problemData);
      } catch (error) {
        console.error('Error fetching problem:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProblem();
  }, [params]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold">Loading...</p>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl font-semibold">Problem not found</p>
        <Button onClick={() => router.push('/problems')}>
          Go back to problems
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="my-6">
        <div className="flex items-center gap-4">
          <Link href="/problems">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">{problem.title}</h1>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex w-1/2 flex-col">
          <ProblemComponent
            problem={{
              id: problem.id,
              title: problem.title,
              description: problem.description,
              maxInputLength: problem.max_input_length,
              exampleInput: problem.example_input,
              exampleOutput: problem.example_output,
            }}
          />
          <TestCaseComponent testcases={problem.testcases} />
        </div>

        <PromptComponent
          problem={{
            id: problem.id,
            title: problem.title,
            description: problem.description,
            maxInputLength: problem.max_input_length,
            exampleInput: problem.example_input,
            exampleOutput: problem.example_output,
            testcases: problem.testcases.map(
              (testCase) => testCase.input || ''
            ),
          }}
        />
      </div>
    </div>
  );
}

// Fetch Problem from Supabase
async function getProblem(
  problemId: string
): Promise<ExtendedNovaProblem | null> {
  const supabase = createClient();

  try {
    // Fetch problem details
    const { data: problem, error: problemError } = await supabase
      .from('nova_problems')
      .select('*')
      .eq('id', problemId)
      .single();

    if (problemError) {
      console.error('Error fetching problem:', problemError.message);
      return null;
    }

    // Fetch test cases for the problem
    const { data: testcases, error: testcaseError } = await supabase
      .from('nova_problem_testcases')
      .select('*')
      .eq('problem_id', problemId);

    if (testcaseError) {
      console.error('Error fetching test cases:', testcaseError.message);
      return null;
    }

    return {
      ...problem,
      testcases: testcases || [],
    } as ExtendedNovaProblem;
  } catch (error) {
    console.error('Unexpected error fetching problem:', error);
    return null;
  }
}
