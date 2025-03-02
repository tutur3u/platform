'use client';

import ChallengeForm, { type ChallengeFormValues } from './challengeForm';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CreateChallengeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onSubmit = async (values: ChallengeFormValues) => {
    try {
      const url = '/api/v1/challenges';
      const method = 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to save challenge');
      }

      toast({
        title: 'Challenge created successfully',
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
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Challenge
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Challenge</DialogTitle>
          <DialogDescription>
            Create a new prompt engineering challenge for users to practice
            with.
          </DialogDescription>
        </DialogHeader>
        <ChallengeForm onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}
