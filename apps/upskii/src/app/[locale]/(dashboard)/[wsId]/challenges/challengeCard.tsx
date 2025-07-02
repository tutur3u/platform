'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { NovaExtendedChallenge } from '@tuturuuu/types/db';
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
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Countdown } from './Countdown';
import { ConfirmDialog } from './confirmDialog';
import EditChallengeDialog from './editChallengeDialog';
import { TimeProgress } from './TimeProgress';

interface Props {
  isAdmin: boolean;
  challenge: NovaExtendedChallenge;
  canManage: boolean;
  wsId: string;
}

export default function ChallengeCard({
  isAdmin,
  challenge,
  canManage,
  wsId,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [status, setStatus] = useState<
    'disabled' | 'upcoming' | 'preview' | 'active' | 'closed'
  >('disabled');
  const t = useTranslations('nova.challenge.cards');

  // Memoize attempt calculations
  const hasRemainingAttempts = useMemo(
    () => (challenge.total_sessions || 0) < challenge.max_attempts,
    [challenge.total_sessions, challenge.max_attempts]
  );

  const hasRemainingDailyAttempts = useMemo(
    () => (challenge.daily_sessions || 0) < challenge.max_daily_attempts,
    [challenge.daily_sessions, challenge.max_daily_attempts]
  );

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

    // Use a more structured approach to determine status
    if (closeAt && now >= closeAt) {
      setStatus('closed');
    } else if (openAt && now >= openAt) {
      setStatus('active');
    } else if (previewableAt && now >= previewableAt) {
      setStatus('preview');
    } else if (previewableAt || openAt || closeAt) {
      setStatus('upcoming');
    } else {
      // No time constraints
      setStatus('active');
    }
  }, [challenge]);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const handleViewResults = async () => {
    router.push(`/${wsId}/challenges/${challenge.id}/results`);
  };

  const handleEndChallenge = async () => {
    const response = await fetch(
      `/api/v1/sessions/${challenge.lastSession?.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endTime: new Date(
            new Date(challenge.lastSession?.start_time || '').getTime() +
              challenge.duration * 1000
          ).toISOString(),
          status: 'ENDED',
        }),
      }
    );

    if (response.ok) {
      router.refresh();
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
            <AlertCircle className="mr-1 h-3 w-3" /> {t('disabled')}
          </Badge>
        );
      case 'upcoming':
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400"
          >
            <Calendar className="mr-1 h-3 w-3" /> {t('upcoming')}
          </Badge>
        );
      case 'preview':
        return (
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
          >
            <Eye className="mr-1 h-3 w-3" /> {t('preview')}
          </Badge>
        );
      case 'active':
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400"
          >
            <CheckCircle className="mr-1 h-3 w-3" /> {t('active')}
          </Badge>
        );
      case 'closed':
        return (
          <Badge
            variant="outline"
            className="bg-gray-100 text-gray-800 dark:bg-gray-950/30 dark:text-gray-400"
          >
            <TimerOff className="mr-1 h-3 w-3" /> {t('closed')}
          </Badge>
        );
      default:
        return null;
    }
  };

  // Memoize session time calculations
  const sessionTimes = useMemo(() => {
    if (!challenge.lastSession) return null;

    const startTime = new Date(challenge.lastSession.start_time);
    const endTime = challenge.lastSession.end_time
      ? new Date(challenge.lastSession.end_time)
      : new Date(startTime.getTime() + challenge.duration * 1000);

    return { startTime, endTime };
  }, [challenge.lastSession, challenge.duration]);

  const renderSessionStatus = () => {
    if (!challenge.lastSession || !sessionTimes) return null;

    const { startTime, endTime } = sessionTimes;

    if (challenge.lastSession.status === 'IN_PROGRESS') {
      return (
        <div className="mt-4 rounded-md border border-dashed p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium text-sm">{t('your-session')}</h3>
            <Badge variant="outline" className="text-xs">
              {t('in-progress')}
            </Badge>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center text-muted-foreground text-xs">
              <Clock className="mr-1 h-3 w-3" /> {t('time-remaining')}:
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

          <div className="mt-2 text-muted-foreground text-xs">
            <div className="flex items-center">
              <span>
                {' '}
                {t('started-at')}: {format(startTime, 'PPpp')}
              </span>
            </div>
            <div className="flex items-center">
              <span>
                {t('ends-at')}: {format(endTime, 'PPpp')}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderActionButton = () => {
    if (isAdmin || status === 'active') {
      if (challenge.lastSession?.status === 'ENDED') {
        return (
          <>
            {hasRemainingAttempts &&
              (hasRemainingDailyAttempts ? (
                <ConfirmDialog
                  mode="start"
                  challenge={challenge}
                  trigger={
                    <Button className="w-full gap-2">
                      {t('retry-challenges')} <ArrowRight className="h-4 w-4" />
                    </Button>
                  }
                  wsId={wsId}
                />
              ) : (
                <Button className="w-full gap-2" disabled>
                  {t('comeback-tomorrow')}
                </Button>
              ))}

            <Button
              onClick={handleViewResults}
              className="w-full gap-2"
              variant="secondary"
            >
              {t('view-results')} <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        );
      }

      if (challenge.lastSession?.status === 'IN_PROGRESS') {
        return (
          <ConfirmDialog
            mode="resume"
            challenge={challenge}
            trigger={
              <Button className="w-full gap-2">
                {t('resume-challenge')} <ArrowRight className="h-4 w-4" />
              </Button>
            }
            wsId={wsId}
          />
        );
      }

      return (
        <ConfirmDialog
          mode="start"
          challenge={challenge}
          trigger={
            <Button className="w-full gap-2">
              {t('start-challenge')} <ArrowRight className="h-4 w-4" />
            </Button>
          }
          wsId={wsId}
        />
      );
    }

    // For other statuses, use a switch statement for better readability
    switch (status) {
      case 'disabled':
        return (
          <Button disabled className="w-full gap-2">
            {t('not-available')}
          </Button>
        );
      case 'upcoming':
        return (
          <Button disabled className="w-full gap-2">
            {t('available-soon')}
          </Button>
        );
      case 'preview':
        return (
          <Button disabled className="w-full gap-2">
            {t('not-yet-opened')}
          </Button>
        );
      case 'closed':
        return (
          <Button disabled className="w-full gap-2">
            {t('closed')}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Card key={challenge.id} className="flex h-full flex-col overflow-hidden">
        <CardHeader className="flex flex-row justify-between pb-2">
          <div className="flex flex-col gap-2">
            <CardTitle>{challenge.title}</CardTitle>
            {renderStatusBadge()}
          </div>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">{t('open-menu')}</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <EditChallengeDialog
                  challenge={challenge}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('edit')}
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>
        <CardContent className="grow">
          <p className="mb-4 text-muted-foreground">{challenge.description}</p>

          <div className="grid gap-2">
            <div className="flex items-center">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span className="ml-2 text-muted-foreground text-sm">
                {t('duration')}: {formatDuration(challenge.duration)}
              </span>
            </div>

            {['preview', 'active', 'upcoming'].includes(status) && (
              <>
                <div className="flex h-6 items-center">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-indigo-500" />
                    <span className="ml-2 text-muted-foreground text-sm">
                      {t('total-attempts')}: {challenge.total_sessions || 0}/
                      {challenge.max_attempts}
                    </span>
                  </div>
                </div>

                <div className="flex h-6 items-center">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-violet-500" />
                    <span className="ml-2 text-muted-foreground text-sm">
                      {t('daily-attempts')}: {challenge.daily_sessions || 0}/
                      {challenge.max_daily_attempts}
                    </span>
                  </div>
                </div>
              </>
            )}

            {!['preview', 'active', 'upcoming'].includes(status) && (
              <>
                <div className="h-6" />
                <div className="h-6" />
              </>
            )}

            <div className="flex h-6 items-center">
              {status === 'upcoming' && challenge.previewable_at ? (
                <div className="mt-2 flex items-center">
                  <Eye className="h-4 w-4 text-amber-500" />
                  <span className="ml-2 text-muted-foreground text-sm">
                    {t('preview-available')}:{' '}
                    {formatDistanceToNow(new Date(challenge.previewable_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              ) : (
                <div className="h-4" />
              )}
            </div>
          </div>

          {status === 'preview' && challenge.open_at && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarCheck className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  <span className="ml-2 font-medium text-blue-700 text-sm dark:text-blue-300">
                    {t('open-in')}
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
                  <span className="ml-2 font-medium text-amber-700 text-sm dark:text-amber-300">
                    {t('closes-in')}
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

          {renderSessionStatus()}
        </CardContent>
        <CardFooter className="mt-auto flex flex-col gap-2">
          {renderActionButton()}
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete-challenge')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete-challenge-description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChallenge}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
