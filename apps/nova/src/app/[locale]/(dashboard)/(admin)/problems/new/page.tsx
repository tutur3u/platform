'use client';

import ProblemForm, { ProblemFormValues } from '../problem-form';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProblemPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateProblem = async (values: ProblemFormValues) => {
    try {
      setIsSubmitting(true);
      const problemData: any = {
        title: values.title,
        description: values.description,
        max_input_length: values.maxInputLength,
        example_input: values.exampleInput,
        example_output: values.exampleOutput,
      };

      // Only add challenge_id if it has a value
      if (values.challengeId) {
        problemData.challenge_id = values.challengeId;
      }

      // Create new problem
      const { data: problem, error: problemError } = await supabase
        .from('nova_problems')
        .insert(problemData)
        .select()
        .single();

      if (problemError) {
        throw new Error(problemError.message);
      }

      // Insert test cases
      if (problem?.id) {
        const testcasesWithProblemId = values.testcases.map((tc) => ({
          problem_id: problem.id,
          input: tc.input,
        }));

        const { error: testcasesError } = await supabase
          .from('nova_problem_testcases')
          .insert(testcasesWithProblemId);

        if (testcasesError) {
          throw new Error(testcasesError.message);
        }
      }

      toast({
        title: 'Success',
        description: 'Problem created successfully',
      });

      router.push(`/problems/${problem.id}`);
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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/problems">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Create New Problem</h1>
        </div>
      </div>

      <ProblemForm onSubmit={handleCreateProblem} isSubmitting={isSubmitting} />
    </div>
  );
}
