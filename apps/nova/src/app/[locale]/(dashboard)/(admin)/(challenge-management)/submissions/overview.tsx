'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Clock, Users } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface SubmissionStatsProps {
  stats: {
    totalCount: number;
    latestSubmissionDate: string;
    uniqueUsersCount: number;
  };
}

export function SubmissionOverview({ stats }: SubmissionStatsProps) {
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
    <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">
            {t('total-submissions')}
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {stats.totalCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('total-submissions-description')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">
            {t('unique-users')}
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {stats.uniqueUsersCount.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('unique-users-description')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">
            {t('latest-submission')}
          </CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-md">
            {formatDate(stats.latestSubmissionDate)}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('latest-submission-description')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
