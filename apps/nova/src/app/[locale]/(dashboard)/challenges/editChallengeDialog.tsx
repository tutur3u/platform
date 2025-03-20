'use client';

import ChallengeForm, { type ChallengeFormValues } from './challengeForm';
import { type NovaChallenge } from '@tuturuuu/types/db';
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

interface EditChallengeDialogProps {
  challenge: NovaChallenge;
  trigger: React.ReactNode;
  onSuccessfulEdit?: () => void;
}

export default function EditChallengeDialog({
  challenge,
  trigger,
  onSuccessfulEdit,
}: EditChallengeDialogProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Convert string dates to Date objects for the form
  const formattedDefaultValues = {
    ...challenge,
    open_at: challenge.open_at ? new Date(challenge.open_at) : null,
    close_at: challenge.close_at ? new Date(challenge.close_at) : null,
    previewable_at: challenge.previewable_at
      ? new Date(challenge.previewable_at)
      : null,
  };

  const onSubmit = async (values: ChallengeFormValues) => {
    try {
      setIsSubmitting(true);

      const response = await fetch(`/api/v1/challenges/${challenge.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to save challenge');
      }

      toast({
        title: 'Challenge updated successfully',
        variant: 'default',
      });

      setOpen(false);

      // Call the onSuccessfulEdit callback if provided
      if (onSuccessfulEdit) {
        onSuccessfulEdit();
      }

      router.refresh();
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
          <DialogTitle>Edit Challenge</DialogTitle>
          <DialogDescription>
            Make changes to the challenge details.
          </DialogDescription>
        </DialogHeader>
        <ChallengeForm
          challengeId={challenge.id}
          defaultValues={formattedDefaultValues}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
