import { getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ChartArea, Clock, TrendingUp, Users } from '@tuturuuu/ui/icons';

export default async function TimeTrackerAnalyticsPage() {
  const t = await getTranslations();
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <ChartArea className="h-6 w-6 text-primary" />
        <h1 className="font-bold text-2xl">{t('time-tracker.analytics.title')}</h1>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('time-tracker.analytics.total_time')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">127.5h</div>
            <p className="text-muted-foreground text-xs">
              {t('time-tracker.analytics.from_last_month', { value: '+12.3%' })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('time-tracker.analytics.active_projects')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">8</div>
            <p className="text-muted-foreground text-xs">{t('time-tracker.analytics.new_this_week', { count: 2 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">{t('time-tracker.analytics.team_members')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">12</div>
            <p className="text-muted-foreground text-xs">
              {t('time-tracker.analytics.all_active_this_month')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('time-tracker.analytics.productivity_score')}
            </CardTitle>
            <ChartArea className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">87%</div>
            <p className="text-muted-foreground text-xs">{t('time-tracker.analytics.from_last_week', { value: '+5%' })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('time-tracker.analytics.time_distribution_title')}</CardTitle>
            <CardDescription>
              {t('time-tracker.analytics.time_distribution_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground" aria-hidden="true">
              {t('time-tracker.analytics.chart_placeholder_time_distribution')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('time-tracker.analytics.weekly_trends_title')}</CardTitle>
            <CardDescription>
              {t('time-tracker.analytics.weekly_trends_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground" aria-hidden="true">
              {t('time-tracker.analytics.chart_placeholder_weekly_trends')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Analytics Sections */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Insights</CardTitle>
          <CardDescription>Key metrics and recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-green-600 text-lg">
                Peak Hours
              </div>
              <div className="font-bold text-2xl">9 AM - 11 AM</div>
              <div className="text-muted-foreground text-sm">
                Most productive time
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-blue-600 text-lg">
                Focus Score
              </div>
              <div className="font-bold text-2xl">92%</div>
              <div className="text-muted-foreground text-sm">
                High concentration
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-lg text-orange-600">
                Break Efficiency
              </div>
              <div className="font-bold text-2xl">78%</div>
              <div className="text-muted-foreground text-sm">Good balance</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
