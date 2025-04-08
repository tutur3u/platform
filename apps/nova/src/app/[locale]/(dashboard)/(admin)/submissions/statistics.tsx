import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

interface SubmissionStatsProps {
  stats: {
    totalCount: number;
    averageScore: number;
    highestScore: number;
    lastSubmissionDate: string;
  } | null;
  statsLoading: boolean;
  formatDate: (dateString: string) => string;
}

export function SubmissionStatistics({
  stats,
  statsLoading,
  formatDate,
}: SubmissionStatsProps) {
  return (
    <div className="mb-10 grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-medium text-muted-foreground">
              Total Submissions
            </h3>
            {statsLoading ? (
              <Skeleton className="mx-auto mt-2 h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold">{stats?.totalCount || 0}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-medium text-muted-foreground">Average Score</h3>
            {statsLoading ? (
              <Skeleton className="mx-auto mt-2 h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold">
                {stats?.averageScore?.toFixed(1) || '0.0'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-medium text-muted-foreground">Highest Score</h3>
            {statsLoading ? (
              <Skeleton className="mx-auto mt-2 h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold">{stats?.highestScore || 0}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-medium text-muted-foreground">
              Last Submission
            </h3>
            {statsLoading ? (
              <Skeleton className="mx-auto mt-2 h-8 w-32" />
            ) : (
              <p className="text-lg font-medium">
                {stats?.lastSubmissionDate
                  ? formatDate(stats.lastSubmissionDate)
                  : '-'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
