'use client';

import ProblemForm, { ProblemFormValues } from '../../problem-form';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  params: Promise<{
    problemId: string;
  }>;
}

export default function EditProblemPage({ params }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [problemId, setProblemId] = useState<string>('');
  const [initialData, setInitialData] = useState<Partial<ProblemFormValues>>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchProblemId = async () => {
      const { problemId } = await params;
      setProblemId(problemId);
    };

    fetchProblemId();
  }, [params]);

  useEffect(() => {
    const fetchProblem = async () => {
      setIsLoading(true);

      try {
        // Fetch problem details
        const { data: problem, error: problemError } = await supabase
          .from('nova_problems')
          .select('*')
          .eq('id', problemId)
          .single();

        if (problemError) {
          toast({
            title: 'Error',
            description: 'Failed to load problem',
            variant: 'destructive',
          });
          router.push('/problems');
          return;
        }

        // Fetch testcases
        const { data: testcasesData, error: testcasesError } = await supabase
          .from('nova_problem_testcases')
          .select('*')
          .eq('problem_id', problemId);

        if (testcasesError) {
          toast({
            title: 'Error',
            description: 'Failed to load test cases',
            variant: 'destructive',
          });
          return;
        }

        // Set initial form data
        setInitialData({
          title: problem.title,
          description: problem.description,
          maxPromptLength: problem.max_prompt_length,
          exampleInput: problem.example_input,
          exampleOutput: problem.example_output,
          challengeId: problem.challenge_id,
          testcases:
            testcasesData && testcasesData.length > 0
              ? testcasesData.map((tc: any) => ({
                  id: tc.id,
                  input: tc.input || '',
                }))
              : [],
        });
      } catch (error) {
        console.error('Error fetching problem data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load problem data',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (problemId) {
      fetchProblem();
    }
  }, [problemId]);

  const handleUpdateProblem = async (values: ProblemFormValues) => {
    try {
      setIsSubmitting(true);

      // Prepare problem data without null values for Supabase
      const problemData: any = {
        title: values.title,
        description: values.description,
        max_prompt_length: values.maxPromptLength,
        example_input: values.exampleInput,
        example_output: values.exampleOutput,
      };

      // Only add challenge_id if it has a value
      if (values.challengeId) {
        problemData.challenge_id = values.challengeId;
      }

      // Update existing problem
      const { error: problemError } = await supabase
        .from('nova_problems')
        .update(problemData)
        .eq('id', problemId);

      if (problemError) {
        throw new Error(problemError.message);
      }

      // Handle test cases - first remove existing ones
      const { error: deleteError } = await supabase
        .from('nova_problem_testcases')
        .delete()
        .eq('problem_id', problemId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      // Insert updated test cases
      const testcasesWithProblemId = values.testcases.map((tc) => ({
        problem_id: problemId,
        input: tc.input,
      }));

      const { error: testcasesError } = await supabase
        .from('nova_problem_testcases')
        .insert(testcasesWithProblemId);

      if (testcasesError) {
        throw new Error(testcasesError.message);
      }

      toast({
        title: 'Success',
        description: 'Problem updated successfully',
      });

      router.push(`/problems/${problemId}`);
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-xl font-semibold">Loading problem...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="my-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/problems/${problemId}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Edit Problem</h1>
        </div>
      </div>

      <ProblemForm
        problemId={problemId}
        defaultValues={initialData}
        onSubmit={handleUpdateProblem}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
