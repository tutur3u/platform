import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  NovaProblem,
  NovaProblemTestCase,
  NovaSubmissionWithScores,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { ArrowLeft } from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Link from 'next/link';
import ProblemComponent from '../../../../shared/problem-component';
import PromptComponent from '../../../../shared/prompt-component';
import PromptForm from '../../../../shared/prompt-form';
import TestCaseComponent from '../../../../shared/test-case-component';

type ExtendedNovaProblem = NovaProblem & {
  test_cases: NovaProblemTestCase[];
};

interface Props {
  params: Promise<{
    problemId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { problemId } = await params;
  const problem = await getProblem(problemId);
  const submissions = await getSubmissions(problemId);

  if (!problem) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="font-semibold text-xl">Problem not found</p>
        <Link href="/problems">
          <Button>Go back to problems</Button>
        </Link>
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
        <h1 className="font-bold text-xl">{problem.title}</h1>
      </div>

      <div className="relative grid h-[calc(100vh-4rem)] grid-cols-1 gap-4 overflow-scroll p-6 md:grid-cols-2">
        <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
          <Card className="h-full overflow-y-auto border-foreground/10 bg-foreground/5">
            <CardContent className="p-0">
              <Tabs defaultValue="problem" className="w-full">
                <TabsList className="w-full rounded-t-lg rounded-b-none bg-foreground/10">
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
            <PromptForm problem={problem} submissions={submissions} />
          </PromptComponent>
        </div>
      </div>
    </div>
  );
}

async function getProblem(
  problemId: string
): Promise<ExtendedNovaProblem | null> {
  const sbAdmin = await createAdminClient();

  try {
    // Fetch problem details
    const { data: problem, error: problemError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('id', problemId)
      .single();

    if (problemError) {
      console.error('Error fetching problem:', problemError.message);
      return null;
    }

    // Fetch test cases for the problem
    const { data: testCases, error: testcaseError } = await sbAdmin
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

async function getSubmissions(
  problemId: string
): Promise<NovaSubmissionWithScores[]> {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    throw new Error('Unauthorized');
  }

  const { data: submissions, error } = await sbAdmin
    .from('nova_submissions_with_scores')
    .select('*')
    .eq('problem_id', problemId)
    .is('session_id', null)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }

  return submissions;
}
