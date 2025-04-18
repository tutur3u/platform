'use client';

import ChallengeForm, { type ChallengeFormValues } from './challengeForm';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useState } from 'react';

interface CreateChallengeDialogProps {
  trigger: React.ReactNode;
}

export default function CreateChallengeDialog({
  trigger,
}: CreateChallengeDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const onSubmit = async (values: ChallengeFormValues) => {
    try {
      setIsSubmitting(true);

      const response = await fetch('/api/v1/challenges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          password: values.enablePassword ? values.password || undefined : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save challenge');
      }

      toast({
        title: 'Challenge created successfully',
        variant: 'default',
      });

      const challenge = await response.json();

      await Promise.allSettled(
        values.criteria.map((c) =>
          fetch(`/api/v1/criteria`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: c.name,
              description: c.description,
              challengeId: challenge.id,
            }),
          })
        )
      );

      await Promise.allSettled(
        values.whitelistedEmails.map((email) =>
          fetch(`/api/v1/challenges/${challenge.id}/whitelists`, {
            method: 'POST',
            body: JSON.stringify({ email }),
          })
        )
      );

      // Invalidate challenges query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ['challenges'] });

      setOpen(false);
    } catch (error) {
      console.error('Error saving challenge:', error);
      toast({
        title: 'Failed to save challenge',
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
          <DialogTitle>Create New Challenge</DialogTitle>
          <DialogDescription>
            Create a new prompt engineering challenge for users to practice
            with.
          </DialogDescription>
        </DialogHeader>
        <ChallengeForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
      </DialogContent>
    </Dialog>
  );
}
