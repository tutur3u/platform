'use client';

import ChallengeForm from './challengeForm';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Plus } from 'lucide-react';

export default function CreateChallengeDialog() {
  return (
    <Dialog>
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
        <ChallengeForm />
      </DialogContent>
    </Dialog>
  );
}
