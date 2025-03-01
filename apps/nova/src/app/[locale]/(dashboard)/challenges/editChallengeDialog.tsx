'use client';

import ChallengeForm from './challengeForm';
import { type NovaChallenge } from '@tuturuuu/types/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useState } from 'react';

interface EditChallengeDialogProps {
  challenge: NovaChallenge;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export default function EditChallengeDialog({
  challenge,
  trigger,
  onSuccess,
}: EditChallengeDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    if (onSuccess) onSuccess();
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
            description: challenge.description || '',
            duration: challenge.duration || 60,
          }}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
