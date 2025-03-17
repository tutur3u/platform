'use client';

import { Countdown } from './components/Countdown';
import { StartChallengeDialog } from './components/StartChallengeDialog';
import { TimeProgress } from './components/TimeProgress';
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
import { formatDuration } from '@tuturuuu/utils/format';
import { format, formatDistanceToNow } from 'date-fns';
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
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [status, setStatus] = useState<
    'preview' | 'upcoming' | 'active' | 'expired' | 'disabled'
  >('disabled');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchSession = async () => {
      const challengeSession = await fetchChallengeSession(challenge.id);
      setSession(challengeSession);
    };
    fetchSession();
  }, [challenge.id, refreshTrigger]);

  useEffect(() => {
    // Determine challenge status
    const updateStatus = () => {
      const now = new Date();
      const openAt = challenge.open_at ? new Date(challenge.open_at) : null;
      const closeAt = challenge.close_at ? new Date(challenge.close_at) : null;
      const previewableAt = challenge.previewable_at
        ? new Date(challenge.previewable_at)
        : null;

      if (!challenge.enabled) {
        setStatus('disabled');
      } else if (closeAt && now > closeAt) {
        setStatus('expired');
      } else if (openAt && now >= openAt) {
        setStatus('active');
      } else if (previewableAt && now >= previewableAt && isAdmin) {
        setStatus('preview');
      } else if (openAt) {
        setStatus('upcoming');
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [
    challenge.enabled,
    challenge.open_at,
    challenge.close_at,
    challenge.previewable_at,
    isAdmin,
  ]);

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

  const handleSessionStart = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const calculateTimeProgress = (current: Date, target: Date) => {
    // For upcoming events, calculate how close we are to the target date
    // This is used for progress bar visualization
    const now = current.getTime();
    const targetTime = target.getTime();
    const difference = targetTime - now;

    // If target date is past, return 100%
    if (difference <= 0) return 100;

    // If target date is more than 7 days away, show minimal progress
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (difference > sevenDays) return 5;

    // Otherwise, calculate percentage of time elapsed
    const percentage = 100 - (difference / sevenDays) * 100;
    return percentage;
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'preview':
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800">
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Badge>
        );
      case 'upcoming':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            <Calendar className="mr-1 h-3 w-3" /> Upcoming
          </Badge>
        );
      case 'active':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800">
            <CheckCircle className="mr-1 h-3 w-3" /> Active
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-800">
            <TimerOff className="mr-1 h-3 w-3" /> Expired
          </Badge>
        );
      case 'disabled':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800">
            <AlertCircle className="mr-1 h-3 w-3" /> Disabled
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderSessionStatus = () => {
    if (!session) return null;

    const now = new Date();
    const startTime = session.start_time ? new Date(session.start_time) : null;
    const endTime = session.end_time ? new Date(session.end_time) : null;

    if (!startTime || !endTime) return null;

    if (session.status === 'IN_PROGRESS') {
      const isExpired = now > endTime;

      return (
        <div className="mt-4 rounded-md border border-dashed p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Your Session</h3>
            <Badge
              variant={isExpired ? 'destructive' : 'outline'}
              className="text-xs"
            >
              {isExpired ? "Time's up" : 'In Progress'}
            </Badge>
          </div>

          {!isExpired && now >= startTime && (
            <>
              <div className="mb-2">
                <TimeProgress startDate={startTime} endDate={endTime} />
              </div>
              <div className="flex items-center justify-center">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Clock className="mr-1 h-3 w-3" /> Time remaining:
                </div>
                <Countdown
                  targetDate={endTime}
                  onComplete={handleSessionStart}
                  className="ml-2"
                />
              </div>
            </>
          )}

          <div className="mt-2 text-xs text-muted-foreground">
            <div className="flex items-center">
              <span>Started: {format(startTime, 'PPp')}</span>
            </div>
            <div className="flex items-center">
              <span>Ends: {format(endTime, 'PPp')}</span>
            </div>
          </div>
        </div>
      );
    }

    if (session.status === 'ENDED') {
      return (
        <div className="mt-4 rounded-md border border-dashed p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Your Session</h3>
            <Badge variant="secondary" className="text-xs">
              Completed
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            <div>Completed on {format(new Date(session.end_time), 'PPp')}</div>
            {session.total_score !== null && (
              <div className="mt-1 font-medium">
                Score: {session.total_score}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <Card key={challenge.id} className="flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex flex-col">
            <CardTitle className="flex">
              <span>{challenge.title}</span>
            </CardTitle>
            <div className="mt-1">{renderStatusBadge()}</div>
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
        <CardContent className="flex-grow">
          <p className="mb-4 text-muted-foreground">{challenge.description}</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">
                Duration: {formatDuration(challenge.duration)}
              </span>
            </div>

            {challenge.previewable_at && isAdmin && (
              <div className="flex items-center">
                <Eye className="h-4 w-4 text-amber-500" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Preview available:{' '}
                  {new Date() >= new Date(challenge.previewable_at)
                    ? 'Now'
                    : formatDistanceToNow(new Date(challenge.previewable_at), {
                        addSuffix: true,
                      })}
                </span>
              </div>
            )}

            {status === 'upcoming' && challenge.open_at && (
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CalendarCheck className="h-4 w-4 text-blue-500" />
                    <span className="ml-2 text-sm font-medium text-blue-700">
                      Opens in:
                    </span>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                    {format(new Date(challenge.open_at), 'MMM d, yyyy')}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-center">
                  <Countdown
                    targetDate={new Date(challenge.open_at)}
                    onComplete={handleSessionStart}
                  />
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{
                      width: `${Math.min(100, Math.max(5, calculateTimeProgress(new Date(), new Date(challenge.open_at))))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {status === 'active' && challenge.close_at && (
              <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CalendarX className="h-4 w-4 text-amber-500" />
                    <span className="ml-2 text-sm font-medium text-amber-700">
                      Closes in:
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700"
                  >
                    {format(new Date(challenge.close_at), 'MMM d, yyyy')}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-center">
                  <Countdown
                    targetDate={new Date(challenge.close_at)}
                    onComplete={handleSessionStart}
                  />
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-amber-100">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{
                      width: `${Math.min(100, Math.max(5, 100 - calculateTimeProgress(new Date(), new Date(challenge.close_at))))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {renderSessionStatus()}
        </CardContent>
        <CardFooter>
          {session?.status === 'IN_PROGRESS' ? (
            <Button onClick={handleResumeChallenge} className="w-full gap-2">
              Resume Challenge <ArrowRight className="h-4 w-4" />
            </Button>
          ) : session?.status === 'ENDED' ? (
            <Button
              onClick={handleViewResults}
              className="w-full gap-2"
              variant="secondary"
            >
              View Results <ArrowRight className="h-4 w-4" />
            </Button>
          ) : status === 'active' || (isAdmin && status === 'preview') ? (
            <StartChallengeDialog
              challenge={challenge}
              onSessionStart={handleSessionStart}
            />
          ) : status === 'upcoming' ? (
            <Button disabled className="w-full gap-2">
              Available Soon
            </Button>
          ) : (
            <Button disabled className="w-full gap-2">
              Not Available
            </Button>
          )}
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

async function fetchChallengeSession(challengeId: string) {
  const response = await fetch(`/api/v1/sessions?challengeId=${challengeId}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data[0];
}
