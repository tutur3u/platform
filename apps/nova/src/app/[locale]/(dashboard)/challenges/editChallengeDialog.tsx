'use client';

import ChallengeForm, { type ChallengeFormValues } from './challengeForm';
import {
  type NovaChallenge,
  type NovaChallengeCriteria,
} from '@tuturuuu/types/db';
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
import { useEffect, useState } from 'react';

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
  const [criteria, setCriteria] = useState<NovaChallengeCriteria[]>([]);

  // Fetch criteria when dialog opens
  useEffect(() => {
    const fetchCriteria = async () => {
      try {
        const response = await fetch(
          `/api/v1/criteria?challengeId=${challenge.id}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch criteria');
        }
        const data = await response.json();
        setCriteria(data);
      } catch (error) {
        console.error('Error fetching criteria:', error);
        toast({
          title: 'Failed to fetch criteria',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    };

    if (open) {
      fetchCriteria();
    }
  }, [open, challenge.id]);

  // Convert string dates to Date objects for the form
  const formattedDefaultValues = {
    title: challenge.title,
    description: challenge.description,
    criteria: criteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })),
    duration: challenge.duration,
    enabled: challenge.enabled,
    openAt: challenge.open_at ? new Date(challenge.open_at) : null,
    closeAt: challenge.close_at ? new Date(challenge.close_at) : null,
    previewableAt: challenge.previewable_at
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

      // Find criteria to create, update, and delete
      const newCriteriaIds = new Set(values.criteria.map((c) => c.id));

      // Criteria to create (those without IDs)
      const criteriaToCreate = values.criteria.filter((c) => !c.id);

      // Criteria to update (those with existing IDs)
      const criteriaToUpdate = values.criteria.filter((c) => c.id);

      // Criteria to delete (IDs that exist in old but not in new)
      const criteriaToDelete = criteria.filter(
        (c) => !newCriteriaIds.has(c.id)
      );

      // Handle all criteria operations
      await Promise.allSettled([
        // Create new criteria
        ...criteriaToCreate.map((c) =>
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
        ),
        // Update existing criteria
        ...criteriaToUpdate.map((c) =>
          fetch(`/api/v1/criteria/${c.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: c.name, description: c.description }),
          })
        ),
        // Delete removed criteria
        ...criteriaToDelete.map((c) =>
          fetch(`/api/v1/criteria/${c.id}`, {
            method: 'DELETE',
          })
        ),
      ]);

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
