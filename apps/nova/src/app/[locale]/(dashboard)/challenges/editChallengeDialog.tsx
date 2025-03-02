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
}

export default function EditChallengeDialog({
  challenge,
  trigger,
}: EditChallengeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onSubmit = async (values: ChallengeFormValues) => {
    try {
      const url = `/api/v1/challenges/${challenge.id}`;
      const method = 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          created_at: challenge.created_at,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save challenge');
      }

      toast({
        title: 'Challenge updated successfully',
        variant: 'default',
      });

      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error saving challenge:', error);
      toast({
        title: 'Failed to save challenge',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Challenge</DialogTitle>
          <DialogDescription>
            Make changes to the challenge details.
          </DialogDescription>
        </DialogHeader>
        <ChallengeForm
          challengeId={challenge.id}
          defaultValues={{
            title: challenge.title,
            description: challenge.description,
            duration: challenge.duration,
          }}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
