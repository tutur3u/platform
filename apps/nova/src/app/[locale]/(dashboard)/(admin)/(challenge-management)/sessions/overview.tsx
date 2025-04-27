'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Clock, Users } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface SessionStatsProps {
  stats: {
    totalCount: number;
    activeCount: number;
    completedCount: number;
    latestSessionDate: string;
    uniqueUsersCount: number;
  };
}

export function SessionOverview({ stats }: SessionStatsProps) {
  const t = useTranslations('nova.submission-page');

  function formatDate(dateString: string) {
    if (!dateString) return t('no-submissions-yet');
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
          <CardTitle className="text-sm font-medium">
            {t('total-submissions')}
          </CardTitle>
          <Users className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('total-submissions-description')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
          <Users className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.activeCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">
            Currently active sessions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('unique-users')}
          </CardTitle>
          <Users className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.uniqueUsersCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('unique-users-description')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('latest-submission')}
          </CardTitle>
          <Clock className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-md font-bold">
            {formatDate(stats.latestSessionDate)}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('latest-submission-description')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
