'use client';

import EditChallengeDialog from './editChallengeDialog';
import type { NovaChallenge, NovaSession } from '@tuturuuu/types/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { formatDuration } from '@tuturuuu/utils/format';
import {
  ArrowRight,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface ChallengeCardProps {
  isAdmin: boolean;
  challenge: NovaChallenge;
}

export default function ChallengeCard({
  isAdmin,
  challenge,
}: ChallengeCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [session, setSession] = useState<NovaSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      const challengeSession = await fetchChallengeSession(challenge.id);
      setSession(challengeSession);
    };
    fetchSession();
  }, [challenge.id]);

  const handleStartChallenge = async () => {
    const session = await fetchChallengeSession(challenge.id);
    const problems = await fetchChallengeProblems(challenge.id);

    if (problems.length === 0) {
      toast({
        title: 'No problems found.',
        description:
          'This challenge has no problems. Please contact the administrator.',
        variant: 'destructive',
      });
      return;
    }

    if (session?.status === 'IN_PROGRESS') {
      router.push(`/challenges/${challenge.id}`);
      return;
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + challenge.duration * 1000);

    const response = await fetch(`/api/v1/challenges/${challenge.id}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'IN_PROGRESS',
        totalScore: 0,
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
  };

  const handleResumeChallenge = async () => {
    router.push(`/challenges/${challenge.id}`);
  };

  const handleViewResults = async () => {
    router.push(`/challenges/${challenge.id}/results`);
  };

  const handleDeleteChallenge = async () => {
    try {
      const response = await fetch(`/api/v1/challenges/${challenge.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        toast({
          title: 'Failed to delete challenge.',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting challenge:', error);
      toast({
        title: 'An error occurred while deleting the challenge.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card key={challenge.id} className="flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="flex">
            <span>{challenge.title}</span>
          </CardTitle>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <EditChallengeDialog
                  challenge={challenge}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>
        <CardContent className="flex-grow">
          <p className="mb-4 text-muted-foreground">{challenge.description}</p>
          <div className="flex items-center">
            <Clock className="h-4 w-4" />
            <span className="ml-2 text-sm text-muted-foreground">
              Duration: {formatDuration(challenge.duration)}
            </span>
          </div>
        </CardContent>
        <CardFooter>
          {session?.status === 'IN_PROGRESS' ? (
            <Button onClick={handleResumeChallenge} className="w-full gap-2">
              Resume Challenge <ArrowRight className="h-4 w-4" />
            </Button>
          ) : session?.status === 'ENDED' ? (
            <Button onClick={handleViewResults} className="w-full gap-2">
              View Results <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => setShowStartDialog(true)}
              className="w-full gap-2"
            >
              Start Challenge <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>

      <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Challenge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to start this challenge?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartChallenge}>
              Start
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Challenge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this challenge? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChallenge}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

async function fetchChallengeSession(challengeId: string) {
  const response = await fetch(`/api/v1/challenges/${challengeId}/session`);
  if (!response.ok) return null;
  return response.json();
}

async function fetchChallengeProblems(challengeId: string) {
  const response = await fetch(`/api/v1/problems?challengeId=${challengeId}`);
  if (!response.ok) return [];
  return response.json();
}
