'use client';

import ProblemForm, { type ProblemFormValues } from './problem-form';
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

interface CreateProblemDialogProps {
  trigger: React.ReactNode;
}

export default function CreateProblemDialog({
  trigger,
}: CreateProblemDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (values: ProblemFormValues) => {
    try {
      setIsSubmitting(true);

      const response = await fetch('/api/v1/problems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to save problem');
      }

      toast({
        title: 'Success',
        description: 'Problem created successfully',
      });

      const problem = await response.json();

      if (problem?.id) {
        Promise.allSettled(
          values.testCases.map((tc) =>
            fetch('/api/v1/test-cases', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ problemId: problem.id, input: tc.input }),
            })
          )
        );
      }

      setOpen(false);
      router.refresh();
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Problem</DialogTitle>
          <DialogDescription>
            Create a new prompt engineering problem for users to practice with.
          </DialogDescription>
        </DialogHeader>
        <ProblemForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
      </DialogContent>
    </Dialog>
  );
}
