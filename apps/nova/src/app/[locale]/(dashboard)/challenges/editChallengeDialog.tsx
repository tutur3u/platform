'use client';

import ChallengeForm, { ChallengeFormValues } from './challengeForm';
import { useQueryClient } from '@tanstack/react-query';
import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaChallengeWhitelistedEmail,
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
import { useMemo, useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
  whitelists: NovaChallengeWhitelistedEmail[];
};

interface Props {
  challenge: ExtendedNovaChallenge;
  trigger: React.ReactNode;
}

export default function EditChallengeDialog({ challenge, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  // Convert string dates to Date objects for the form
  const formattedDefaultValues = useMemo(() => {
    return {
      title: challenge.title,
      description: challenge.description,
      criteria: challenge.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
      })),
      duration: challenge.duration,
      enabled: challenge.enabled,
      whitelistedEmails: challenge.whitelists.map((w) => w.email),
      openAt: challenge.open_at ? new Date(challenge.open_at) : null,
      closeAt: challenge.close_at ? new Date(challenge.close_at) : null,
      previewableAt: challenge.previewable_at
        ? new Date(challenge.previewable_at)
        : null,
      password: challenge.password_hash ? '' : null,
    };
  }, [challenge]);

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

      // Criteria to create (those without IDs)
      const criteriaToCreate = values.criteria.filter((c) => !c.id);

      // Criteria to update (those with existing IDs)
      const criteriaToUpdate = values.criteria.filter((c) => c.id);

      // Criteria to delete (IDs that exist in old but not in new)
      const newCriteriaIds = new Set(values.criteria.map((c) => c.id));
      const criteriaToDelete = challenge.criteria.filter(
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

      const emailsToCreate = values.whitelistedEmails.filter(
        (email) => !challenge.whitelists.map((w) => w.email).includes(email)
      );

      const emailsToDelete = challenge.whitelists
        .filter((w) => !values.whitelistedEmails.includes(w.email))
        .map((w) => w.email);

      await Promise.allSettled([
        ...emailsToCreate.map((email) =>
          fetch(`/api/v1/challenges/${challenge.id}/whitelists`, {
            method: 'POST',
            body: JSON.stringify({ email }),
          })
        ),
        ...emailsToDelete.map((email) =>
          fetch(
            `/api/v1/challenges/${challenge.id}/whitelists?email=${email}`,
            {
              method: 'DELETE',
            }
          )
        ),
      ]);

      // Invalidate challenges query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ['challenges'] });

      setOpen(false);
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
