'use client';

import type { NovaChallenge } from '@tuturuuu/types/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { formatDuration } from '@tuturuuu/utils/format';
import { ArrowRight, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface StartChallengeDialogProps {
  challenge: NovaChallenge;
  variant?: 'default' | 'outline' | 'secondary';
  disabled?: boolean;
}

export function StartChallengeDialog({
  challenge,
  variant = 'default',
  disabled = false,
}: StartChallengeDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartChallenge = async () => {
    setIsStarting(true);

    try {
      // Fetch existing problems first
      const problems = await fetchChallengeProblems(challenge.id);

      if (problems.length === 0) {
        toast({
          title: 'No problems found.',
          description:
            'This challenge has no problems. Please contact the administrator.',
          variant: 'destructive',
        });
        setOpen(false);
        return;
      }

      // Create a new session
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + challenge.duration * 1000);

      const response = await fetch(`/api/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          status: 'IN_PROGRESS',
          totalScore: 0,
          challengeId: challenge.id,
        }),
      });

      if (response.ok) {
        router.push(`/challenges/${challenge.id}`);
      } else {
        toast({
          title: 'Failed to start challenge.',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error starting challenge', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsStarting(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={disabled ? 'secondary' : variant}
          className="w-full gap-2"
          disabled={
            // Challenge is disabled
            disabled ||
            // Challenge is not open yet
            (!!challenge.open_at && new Date() < new Date(challenge.open_at)) ||
            // Challenge is already closed
            (!!challenge.close_at && new Date() > new Date(challenge.close_at))
          }
        >
          {!challenge.open_at ||
          (challenge.open_at && new Date() < new Date(challenge.open_at)) ? (
            <span className="text-muted-foreground">Available Soon</span>
          ) : (
            <>
              <span>Start Challenge</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start Challenge</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to start this challenge?
          </AlertDialogDescription>
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <div className="font-medium">Challenge Details:</div>
            <div className="mt-2 flex items-center">
              <Clock className="mr-2 h-4 w-4 text-primary" />
              <span>Duration: {formatDuration(challenge.duration)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Once started, the timer cannot be paused and will continue until
              completed.
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isStarting}
            onClick={(e) => {
              e.preventDefault();
              handleStartChallenge();
            }}
          >
            {isStarting ? 'Starting...' : 'Start Challenge'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

async function fetchChallengeProblems(challengeId: string) {
  const response = await fetch(`/api/v1/problems?challengeId=${challengeId}`);
  if (!response.ok) return [];
  return response.json();
}
