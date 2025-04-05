'use client';

import { useQueryClient } from '@tanstack/react-query';
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
import { Clock, Eye, EyeOff } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { formatDuration } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ConfirmDialogProps {
  mode: 'start' | 'resume';
  challenge: NovaChallenge;
  trigger: React.ReactNode;
}

export function ConfirmDialog({
  mode = 'start',
  challenge,
  trigger,
}: ConfirmDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);

    try {
      // Check password if challenge is password protected
      if (challenge.password_hash) {
        if (password.length === 0) {
          toast({
            title: 'Password Required',
            description: 'Please enter the password to start the challenge.',
            variant: 'destructive',
          });
          setIsConfirming(false);
          return;
        }

        const response = await fetch(`/api/auth/challenges/verify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: challenge.id,
            password,
          }),
        });

        if (!response.ok) {
          toast({
            title: 'Invalid password',
            description: 'The password you entered is incorrect.',
            variant: 'destructive',
          });
          setIsConfirming(false);
          return;
        }
      }

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

      if (mode === 'start') {
        // Create a new session
        const startTime = new Date();

        const response = await fetch(`/api/v1/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: startTime.toISOString(),
            endTime: null,
            status: 'IN_PROGRESS',
            totalScore: 0,
            challengeId: challenge.id,
          }),
        });

        if (response.ok) {
          // Invalidate challenges query to update the UI with the new session
          queryClient.invalidateQueries({ queryKey: ['challenges'] });
          router.push(`/challenges/${challenge.id}`);
        } else {
          toast({
            title: 'Failed to start challenge.',
            description: 'Please try again.',
            variant: 'destructive',
          });
        }
      } else {
        // Resume existing session
        router.push(`/challenges/${challenge.id}`);
      }
    } catch (error) {
      console.error('Error starting challenge', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === 'start' ? 'Start Challenge' : 'Resume Challenge'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {challenge.password_hash
              ? mode === 'start'
                ? 'Please enter the password to start the challenge.'
                : 'Please enter the password to resume the challenge.'
              : mode === 'start'
                ? 'Are you sure you want to start this challenge?'
                : 'Do you want to resume this challenge?'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {challenge.password_hash && (
          <div className="mb-4">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {mode === 'start' && (
          <div className="bg-muted mt-4 rounded-md p-3 text-sm">
            <div className="font-medium">Challenge Details:</div>
            <div className="mt-2 flex items-center">
              <Clock className="text-primary mr-2 h-4 w-4" />
              <span>Duration: {formatDuration(challenge.duration)}</span>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              Once started, the timer cannot be paused and will continue until
              completed.
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isConfirming} onClick={handleConfirm}>
            {isConfirming
              ? mode === 'start'
                ? 'Starting...'
                : 'Resuming...'
              : mode === 'start'
                ? 'Start Challenge'
                : 'Resume Challenge'}
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
