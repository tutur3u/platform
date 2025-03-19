'use client';

import ProblemForm, { type ProblemFormValues } from './problem-form';
import { type NovaProblem } from '@tuturuuu/types/db';
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
import { useState } from 'react';

interface EditProblemDialogProps {
  problem: NovaProblem;
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
  const formattedDefaultValues = {
    ...problem,
  };

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

      Promise.allSettled(
        values.testcases.map((tc) =>
          fetch(`/api/v1/testcases?problemId=${problem.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: tc.input }),
          })
        )
      );

      toast({
        title: 'Problem updated successfully',
        variant: 'default',
      });

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
