'use client';

import {
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from '@tuturuuu/icons';
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import {
  useDeleteFocusSession,
  useFocusHistory,
} from '../../hooks/use-focus-session';
import type { TunaFocusSession } from '../../types/tuna';

interface FocusHistoryProps {
  className?: string;
  limit?: number;
}

export function FocusHistory({ className, limit = 10 }: FocusHistoryProps) {
  const { data, isLoading } = useFocusHistory(limit);
  const deleteMutation = useDeleteFocusSession();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);

  const handleDelete = (sessionId: string) => {
    deleteMutation.mutate(sessionId, {
      onSuccess: () => {
        toast.success('Focus session deleted');
        setDeleteDialogOpen(null);
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to delete session');
      },
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  if (!data?.sessions.length) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Clock className="mb-2 h-10 w-10 text-muted-foreground" />
          <p className="text-center text-muted-foreground">
            No focus sessions yet.
            <br />
            Start your first one!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-xs">
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">
              {formatDuration(data.week_stats.total_minutes)}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.week_stats.total_sessions} sessions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-xs">
              Daily Avg
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">
              {formatDuration(data.week_stats.avg_daily_minutes)}
            </p>
            <p className="text-muted-foreground text-xs">this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-xs">
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">
              {formatDuration(data.month_stats.total_minutes)}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.month_stats.total_sessions} sessions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-xs">
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{data.pagination.total}</p>
            <p className="text-muted-foreground text-xs">all time</p>
          </CardContent>
        </Card>
      </div>

      {/* Session list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Recent Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.sessions.map((session: TunaFocusSession) => (
            <div
              key={session.id}
              className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              {/* Status icon */}
              <div className="mt-0.5">
                {session.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-dynamic-green" />
                ) : (
                  <XCircle className="h-5 w-5 text-dynamic-yellow" />
                )}
              </div>

              {/* Session details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {formatDate(session.started_at)} at{' '}
                    {formatTime(session.started_at)}
                  </span>
                  <Badge
                    variant={session.completed ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {formatDuration(session.actual_duration ?? 0)} /{' '}
                    {formatDuration(session.planned_duration)}
                  </Badge>
                </div>

                {session.goal && (
                  <div className="mt-1 flex items-start gap-1">
                    <Target className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <p className="line-clamp-1 text-sm">{session.goal}</p>
                  </div>
                )}

                {session.notes && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {session.notes}
                  </p>
                )}
              </div>

              {/* XP earned */}
              {session.xp_earned > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <Sparkles className="h-3 w-3 text-dynamic-yellow" />
                  <span className="font-medium">+{session.xp_earned}</span>
                </div>
              )}

              {/* Delete button */}
              <AlertDialog
                open={deleteDialogOpen === session.id}
                onOpenChange={(open) =>
                  setDeleteDialogOpen(open ? session.id : null)
                }
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Delete session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete focus session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this focus session from your
                      history. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(session.id)}
                      className="bg-destructive hover:bg-destructive/90"
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
