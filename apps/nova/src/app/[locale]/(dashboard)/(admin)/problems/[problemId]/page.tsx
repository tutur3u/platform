'use client';

// Import the components we need for the problem page
import ProblemComponent from '../../../shared/problem-component';
import PromptComponent from '../../../shared/prompt-component';
import TestCaseComponent from '../../../shared/test-case-component';
import PromptForm from './prompt-form';
import { createClient } from '@tuturuuu/supabase/next/client';
import { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { ArrowLeft } from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ExtendedNovaProblem = NovaProblem & {
  test_cases: NovaProblemTestCase[];
};

interface Props {
  params: Promise<{
    problemId: string;
  }>;
}

export default function Page({ params }: Props) {
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
        <p className="text-muted-foreground text-xl font-semibold">
          Loading...
        </p>
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
    <div className="relative h-screen overflow-hidden">
      <div className="flex h-16 items-center gap-4 border-b p-4">
        <Link href="/problems">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{problem.title}</h1>
      </div>

      <div className="relative grid h-[calc(100vh-4rem)] grid-cols-1 gap-4 overflow-scroll p-6 md:grid-cols-2">
        <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
          <Card className="border-foreground/10 bg-foreground/5 h-full overflow-y-auto">
            <CardContent className="p-0">
              <Tabs defaultValue="problem" className="w-full">
                <TabsList className="bg-foreground/10 w-full rounded-b-none rounded-t-lg">
                  <TabsTrigger value="problem" className="flex-1">
                    Problem
                  </TabsTrigger>
                  <TabsTrigger value="test-cases" className="flex-1">
                    Test Cases
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="problem" className="m-0 p-4">
                  <ProblemComponent problem={problem} />
                </TabsContent>
                <TabsContent value="test-cases" className="m-0 p-4">
                  <TestCaseComponent testCases={problem.test_cases} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="relative flex h-full w-full flex-col gap-4 overflow-hidden">
          <PromptComponent>
            <PromptForm problem={problem} />
          </PromptComponent>
        </div>
      </div>
    </div>
  );
}

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
    const { data: testCases, error: testcaseError } = await supabase
      .from('nova_problem_test_cases')
      .select('*')
      .eq('problem_id', problemId);

    if (testcaseError) {
      console.error('Error fetching test cases:', testcaseError.message);
      return null;
    }

    return {
      ...problem,
      test_cases: testCases || [],
    };
  } catch (error) {
    console.error('Unexpected error fetching problem:', error);
    return null;
  }
}
