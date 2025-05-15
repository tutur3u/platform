'use client';

import ProblemForm, { type ProblemFormValues } from './problem-form';
import { ExtendedNovaProblem } from '@tuturuuu/types/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface EditProblemDialogProps {
  problem: ExtendedNovaProblem;
  trigger: React.ReactNode;
}

export default function EditProblemDialog({
  problem,
  trigger,
}: EditProblemDialogProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Convert string dates to Date objects for the form
  const formattedDefaultValues = useMemo(() => {
    return {
      title: problem.title,
      description: problem.description,
      maxPromptLength: problem.max_prompt_length,
      exampleInput: problem.example_input,
      exampleOutput: problem.example_output,
      challengeId: problem.challenge_id,
      testCases:
        problem.test_cases?.map((tc) => ({
          id: tc.id,
          input: tc.input,
          output: tc.output,
          hidden: tc.hidden,
        })) || [],
    };
  }, [problem]);

  const onSubmit = async (values: ProblemFormValues) => {
    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/v1/problems/${problem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        throw new Error('Failed to save problem');
      }
      toast({
        title: 'Problem updated successfully',
        variant: 'default',
      });

      // Find testCases to create, update, and delete
      const newTestCaseIds = new Set(
        values.testCases.map((tc) => tc.id).filter(Boolean)
      );
      const testCasesToCreate = values.testCases.filter((tc) => !tc.id);
      // Testcases to update (those with existing IDs)
      const testCasesToUpdate = values.testCases.filter((tc) => tc.id);
      // Testcases to delete (IDs that exist in old but not in new)
      const testCasesToDelete = problem.test_cases?.filter(
        (tc) => !newTestCaseIds.has(tc.id)
      );

      // Handle all testcase operations
      await Promise.allSettled([
        // Create new testCases
        ...testCasesToCreate.map((tc) =>
          fetch(`/api/v1/test-cases`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: tc.input,
              output: tc.output,
              hidden: tc.hidden,
              problemId: problem.id,
            }),
          })
        ),
        // Update existing testCases
        ...testCasesToUpdate.map((tc) =>
          fetch(`/api/v1/test-cases/${tc.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: tc.input,
              output: tc.output,
              hidden: tc.hidden,
            }),
          })
        ),
        // Delete removed testCases
        ...(testCasesToDelete || []).map((tc) =>
          fetch(`/api/v1/test-cases/${tc.id}`, {
            method: 'DELETE',
          })
        ),
      ]);
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'An error occurred',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex h-[80vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Problem</DialogTitle>
          <DialogDescription>
            Make changes to the problem details.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <ProblemForm
            problemId={problem.id}
            defaultValues={formattedDefaultValues}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
