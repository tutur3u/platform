'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Calendar, Clock, Users } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';

interface SubmissionStats {
  totalCount: number;
  averageScore: number;
  highestScore: number;
  lastSubmissionDate: string;
}

interface SubmissionStatisticsProps {
  stats: SubmissionStats | null;
  statsLoading: boolean;
}

export function SubmissionStatistics({
  stats,
  statsLoading,
}: SubmissionStatisticsProps) {
  function formatDate(dateString: string) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">
            Total Submissions
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="font-bold text-2xl">{stats?.totalCount || 0}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">Average Score</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="font-bold text-2xl">
              {stats ? stats.averageScore.toFixed(1) : '0.0'}
            </div>
          )}
          <p className="text-muted-foreground text-xs">Out of 10.0 points</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">Highest Score</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="font-bold text-2xl">
              {stats ? stats.highestScore.toFixed(1) : '0.0'}
            </div>
          )}
          <p className="text-muted-foreground text-xs">Out of 10.0 points</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">Last Submission</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="font-bold text-md">
              {stats?.lastSubmissionDate
                ? formatDate(stats.lastSubmissionDate)
                : 'No submissions yet'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
