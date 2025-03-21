'use client';

import ProblemForm, { type ProblemFormValues } from './problem-form';
import { type NovaProblem, type NovaProblemTestCase } from '@tuturuuu/types/db';
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

type ExtendedNovaProblem = NovaProblem & {
  testcases: NovaProblemTestCase[];
};

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
      testcases: problem.testcases.map((tc) => ({
        id: tc.id,
        input: tc.input,
      })),
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

      // Find testcases to create, update, and delete
      const newTestcaseIds = new Set(values.testcases.map((tc) => tc.id));
      // Testcases to create (those without IDs)
      const testcasesToCreate = values.testcases.filter((tc) => !tc.id);
      // Testcases to update (those with existing IDs)
      const testcasesToUpdate = values.testcases.filter((tc) => tc.id);
      // Testcases to delete (IDs that exist in old but not in new)
      const testcasesToDelete = problem.testcases.filter(
        (tc) => !newTestcaseIds.has(tc.id)
      );

      // Handle all testcase operations
      await Promise.allSettled([
        // Create new testcases
        ...testcasesToCreate.map((tc) =>
          fetch(`/api/v1/testcases`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: tc.input, problemId: problem.id }),
          })
        ),
        // Update existing testcases
        ...testcasesToUpdate.map((tc) =>
          fetch(`/api/v1/testcases/${tc.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: tc.input }),
          })
        ),
        // Delete removed testcases
        ...testcasesToDelete.map((tc) =>
          fetch(`/api/v1/testcases/${tc.id}`, {
            method: 'DELETE',
          })
        ),
      ]);
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error saving problem:', error);
      toast({
        title: 'Failed to save problem',
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Problem</DialogTitle>
          <DialogDescription>
            Make changes to the problem details.
          </DialogDescription>
        </DialogHeader>
        <ProblemForm
          problemId={problem.id}
          defaultValues={formattedDefaultValues}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
