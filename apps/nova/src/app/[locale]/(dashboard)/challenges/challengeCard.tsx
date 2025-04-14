'use client';

import { Countdown } from './Countdown';
import { TimeProgress } from './TimeProgress';
import { ConfirmDialog } from './confirmDialog';
import EditChallengeDialog from './editChallengeDialog';
import { useQueryClient } from '@tanstack/react-query';
import type {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaChallengeWhitelistedEmail,
  NovaSession,
} from '@tuturuuu/types/db';
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
import { Badge } from '@tuturuuu/ui/badge';
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
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  CalendarX,
  CheckCircle,
  Clock,
  Eye,
  MoreHorizontal,
  Pencil,
  TimerOff,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { formatDuration } from '@tuturuuu/utils/format';
import { format, formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
  whitelists: NovaChallengeWhitelistedEmail[];
};

interface Props {
  isAdmin: boolean;
  challenge: ExtendedNovaChallenge;
}

export default function ChallengeCard({ isAdmin, challenge }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<NovaSession | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);
  const [dailySessions, setDailySessions] = useState(0);
  const [status, setStatus] = useState<
    'disabled' | 'upcoming' | 'preview' | 'active' | 'closed'
  >('disabled');

  const fetchSession = useCallback(async () => {
    const response = await fetch(
      `/api/v1/sessions?challengeId=${challenge.id}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    setSession(data[0]);
  }, [challenge]);

  const fetchSessionCounts = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/sessions/count?challengeId=${challenge.id}`
      );
      if (response.ok) {
        const data = await response.json();
        setTotalSessions(data.total || 0);
        setDailySessions(data.daily || 0);
      }
    } catch (error) {
      console.error('Error fetching session counts:', error);
    }
  }, [challenge]);

  const updateStatus = useCallback(() => {
    if (!challenge.enabled) {
      setStatus('disabled');
      return;
    }

    const now = new Date();
    const previewableAt = challenge.previewable_at
      ? new Date(challenge.previewable_at)
      : null;
    const openAt = challenge.open_at ? new Date(challenge.open_at) : null;
    const closeAt = challenge.close_at ? new Date(challenge.close_at) : null;

    if (!previewableAt && !openAt && !closeAt) {
      setStatus('active');
    }

    if (previewableAt && !openAt && !closeAt) {
      if (now < previewableAt) {
        setStatus('upcoming');
      } else {
        setStatus('preview');
      }
    }

    if (!previewableAt && openAt && !closeAt) {
      if (now < openAt) {
        setStatus('preview');
      } else {
        setStatus('active');
      }
    }

    if (!previewableAt && !openAt && closeAt) {
      if (now < closeAt) {
        setStatus('upcoming');
      } else {
        setStatus('closed');
      }
    }

    if (previewableAt && openAt && !closeAt) {
      if (now < previewableAt) {
        setStatus('upcoming');
      } else if (now < openAt) {
        setStatus('preview');
      } else {
        setStatus('active');
      }
    }

    if (previewableAt && !openAt && closeAt) {
      if (now < previewableAt) {
        setStatus('upcoming');
      } else if (now < closeAt) {
        setStatus('preview');
      } else {
        setStatus('closed');
      }
    }

    if (!previewableAt && openAt && closeAt) {
      if (now < openAt) {
        setStatus('preview');
      } else if (now < closeAt) {
        setStatus('active');
      } else {
        setStatus('closed');
      }
    }

    if (previewableAt && openAt && closeAt) {
      if (now < previewableAt) {
        setStatus('upcoming');
      } else if (now < openAt) {
        setStatus('preview');
      } else if (now < closeAt) {
        setStatus('active');
      } else {
        setStatus('closed');
      }
    }
  }, [challenge]);

  useEffect(() => {
    fetchSession();
    fetchSessionCounts();
    updateStatus();
  }, [fetchSession, fetchSessionCounts, updateStatus]);

  const handleViewResults = async () => {
    router.push(`/challenges/${challenge.id}/results`);
  };

  const handleEndChallenge = async () => {
    const response = await fetch(`/api/v1/sessions/${session?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endTime: new Date(
          new Date(session?.start_time || '').getTime() +
            challenge.duration * 1000
        ).toISOString(),
        status: 'ENDED',
      }),
    });

    if (response.ok) {
      fetchSession();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to end challenge',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteChallenge = async () => {
    try {
      const response = await fetch(`/api/v1/challenges/${challenge.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['challenges'] });
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

  const calculatePercentage = (current: Date, target: Date) => {
    // For upcoming events, calculate how close we are to the target date
    // This is used for progress bar visualization
    const now = current.getTime();
    const targetTime = target.getTime();
    const difference = targetTime - now;

    // If target date is past, return 0%
    if (difference < 0) return 0;

    // If target date is more than 7 days away, return 100%
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (difference > sevenDays) return 100;

    // Otherwise, calculate percentage of time elapsed
    const percentage = (difference / sevenDays) * 100;
    return percentage;
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'disabled':
        return (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400"
          >
            <AlertCircle className="mr-1 h-3 w-3" /> Disabled
          </Badge>
        );
      case 'upcoming':
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400"
          >
            <Calendar className="mr-1 h-3 w-3" /> Upcoming
          </Badge>
        );
      case 'preview':
        return (
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
          >
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Badge>
        );
      case 'active':
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400"
          >
            <CheckCircle className="mr-1 h-3 w-3" /> Active
          </Badge>
        );
      case 'closed':
        return (
          <Badge
            variant="outline"
            className="bg-gray-100 text-gray-800 dark:bg-gray-950/30 dark:text-gray-400"
          >
            <TimerOff className="mr-1 h-3 w-3" /> Closed
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderSessionStatus = () => {
    if (!session) return null;

    const startTime = new Date(session.start_time);
    const endTime = session.end_time
      ? new Date(session.end_time)
      : new Date(
          new Date(session.start_time).getTime() + challenge.duration * 1000
        );

    if (session.status === 'IN_PROGRESS') {
      return (
        <div className="mt-4 rounded-md border border-dashed p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Your Session</h3>
            <Badge variant="outline" className="text-xs">
              In Progress
            </Badge>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="mr-1 h-3 w-3" /> Time remaining:
            </div>
            <Countdown
              target={endTime}
              onComplete={handleEndChallenge}
              className="mb-2"
            />
          </div>
          <TimeProgress
            startTime={startTime}
            endTime={endTime}
            className="mb-2"
          />

          <div className="mt-2 text-xs text-muted-foreground">
            <div className="flex items-center">
              <span>Started at: {format(startTime, 'PPpp')}</span>
            </div>
            <div className="flex items-center">
              <span>Ends at: {format(endTime, 'PPpp')}</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderActionButton = () => {
    if (isAdmin || status === 'active') {
      if (session?.status === 'ENDED') {
        const hasRemainingAttempts = totalSessions < challenge.max_attempts;
        const hasRemainingDailyAttempts =
          dailySessions < challenge.max_daily_attempts;

        return (
          <>
            {hasRemainingAttempts &&
              (hasRemainingDailyAttempts ? (
                <ConfirmDialog
                  mode="start"
                  challenge={challenge}
                  trigger={
                    <Button className="w-full gap-2">
                      Retry Challenge <ArrowRight className="h-4 w-4" />
                    </Button>
                  }
                />
              ) : (
                <Button disabled className="w-full gap-2">
                  Comeback Tomorrow
                </Button>
              ))}

            <Button
              onClick={handleViewResults}
              className="w-full gap-2"
              variant="secondary"
            >
              View Results <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        );
      }

      if (session?.status === 'IN_PROGRESS') {
        return (
          <ConfirmDialog
            mode="resume"
            challenge={challenge}
            trigger={
              <Button className="w-full gap-2">
                Resume Challenge <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />
        );
      }

      return (
        <ConfirmDialog
          mode="start"
          challenge={challenge}
          trigger={
            <Button className="w-full gap-2">
              Start Challenge <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />
      );
    }

    if (status === 'disabled') {
      return (
        <Button disabled className="w-full gap-2">
          Not Available
        </Button>
      );
    }

    if (status === 'upcoming') {
      return (
        <Button disabled className="w-full gap-2">
          Available Soon
        </Button>
      );
    }

    if (status === 'preview') {
      return (
        <Button disabled className="w-full gap-2">
          Not Yet Opened
        </Button>
      );
    }

    if (status === 'closed') {
      return (
        <Button disabled className="w-full gap-2">
          Closed
        </Button>
      );
    }

    return null;
  };

  return (
    <>
      <Card key={challenge.id} className="flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row justify-between pb-2">
          <div className="flex flex-col gap-2">
            <CardTitle>{challenge.title}</CardTitle>
            {renderStatusBadge()}
          </div>
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
        <CardContent>
          <p className="mb-4 text-muted-foreground">{challenge.description}</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">
                Duration: {formatDuration(challenge.duration)}
              </span>
            </div>

            {(status === 'preview' || status === 'active') && (
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-indigo-500" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Total attempts: {totalSessions}/{challenge.max_attempts}
                </span>
              </div>
            )}

            {(status === 'preview' || status === 'active') && (
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-violet-500" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Daily attempts: {dailySessions}/{challenge.max_daily_attempts}
                </span>
              </div>
            )}

            {status === 'upcoming' && challenge.previewable_at && (
              <div className="flex items-center">
                <Eye className="h-4 w-4 text-amber-500" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Preview available:{' '}
                  {formatDistanceToNow(new Date(challenge.previewable_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            )}

            {status === 'preview' && challenge.open_at && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CalendarCheck className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                    <span className="ml-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                      Opens in:
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  >
                    {format(new Date(challenge.open_at), 'MMM d, yyyy')}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-center">
                  <Countdown
                    target={new Date(challenge.open_at)}
                    onComplete={updateStatus}
                  />
                </div>
                <Progress
                  value={calculatePercentage(
                    new Date(),
                    new Date(challenge.open_at)
                  )}
                  className="mt-2 h-1 w-full"
                  indicatorClassName="bg-blue-500 dark:bg-blue-400"
                />
              </div>
            )}

            {status === 'active' && challenge.close_at && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CalendarX className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    <span className="ml-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                      Closes in:
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  >
                    {format(new Date(challenge.close_at), 'MMM d, yyyy')}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-center">
                  <Countdown
                    target={new Date(challenge.close_at)}
                    onComplete={updateStatus}
                  />
                </div>
                <Progress
                  value={calculatePercentage(
                    new Date(),
                    new Date(challenge.close_at)
                  )}
                  className="mt-2 h-1 w-full"
                  indicatorClassName="bg-amber-500 dark:bg-amber-400"
                />
              </div>
            )}
          </div>

          {renderSessionStatus()}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {renderActionButton()}
        </CardFooter>
      </Card>

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
