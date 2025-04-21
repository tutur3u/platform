'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Clock, Users } from '@tuturuuu/ui/icons';

interface SubmissionStatsProps {
  stats: {
    totalCount: number;
    latestSubmissionDate: string;
    uniqueUsersCount: number;
  };
}

export function SubmissionOverview({ stats }: SubmissionStatsProps) {
  function formatDate(dateString: string) {
    if (!dateString) return 'No submissions yet';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Submissions
          </CardTitle>
          <Users className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">All time submissions</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
          <Users className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.uniqueUsersCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">
            Users who have submitted
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Latest Submission
          </CardTitle>
          <Clock className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-md font-bold">
            {formatDate(stats.latestSubmissionDate)}
          </div>
          <p className="text-muted-foreground text-xs">Most recent activity</p>
        </CardContent>
      </Card>
    </div>
  );
}
