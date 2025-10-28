import { Calendar, Play, Target, TrendingUp } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

// Extend dayjs with duration plugin
dayjs.extend(duration);

interface TimeTrackingStats {
  totalSessions: number;
  activeSessions: number;
  activeUsers: number;
  todayTime: number;
  weekTime: number;
  monthTime: number;
  todaySessions: number;
  weekSessions: number;
  monthSessions: number;
  streak: number;
}

interface StatsOverviewProps {
  stats: TimeTrackingStats;
  period: 'day' | 'week' | 'month';
  groupedSessions: Array<{
    totalDuration: number;
    sessions: Array<any>;
  }>;
}

export default function StatsOverview({
  stats,
  period,
  groupedSessions,
}: StatsOverviewProps) {
  // Helper function to format duration in HH:MM:SS
  const formatDuration = (seconds: number) => {
    const dur = dayjs.duration(seconds, 'seconds');
    const hours = Math.floor(dur.asHours());
    const minutes = dur.minutes();
    const secs = dur.seconds();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="overflow-hidden border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/5 to-dynamic-purple/5 transition-all duration-300 hover:shadow-dynamic-blue/10 hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between border-dynamic-blue/20 border-b bg-gradient-to-r from-dynamic-blue/10 to-dynamic-purple/10 pb-4">
          <CardTitle className="font-semibold text-dynamic-blue text-sm">
            Total{' '}
            {period === 'day'
              ? 'Daily'
              : period === 'week'
                ? 'Weekly'
                : 'Monthly'}{' '}
            Sessions
          </CardTitle>
          <div className="rounded-lg bg-dynamic-blue/20 p-2 ring-2 ring-dynamic-blue/10">
            <Calendar className="size-4 text-dynamic-blue" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-2 font-bold text-3xl text-dynamic-blue">
            {stats.totalSessions}
          </div>
          <p className="text-dynamic-muted text-sm">
            {stats.totalSessions > 0
              ? `Across ${stats.activeUsers} user${stats.activeUsers === 1 ? '' : 's'}`
              : 'No sessions yet'}
          </p>
          <div className="mt-4 h-1 rounded-full bg-dynamic-blue/20">
            <div
              className="h-1 rounded-full bg-gradient-to-r from-dynamic-blue to-dynamic-purple transition-all duration-700"
              style={{ width: stats.totalSessions > 0 ? '100%' : '0%' }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-dynamic-green/20 bg-linear-to-br from-dynamic-green/5 to-dynamic-blue/5 transition-all duration-300 hover:shadow-dynamic-green/10 hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between border-dynamic-green/20 border-b bg-gradient-to-r from-dynamic-green/10 to-dynamic-blue/10 pb-4">
          <CardTitle className="font-semibold text-dynamic-green text-sm">
            Active Sessions
          </CardTitle>
          <div className="rounded-lg bg-dynamic-green/20 p-2 ring-2 ring-dynamic-green/10">
            <Play className="size-4 text-dynamic-green" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-2 font-bold text-3xl text-dynamic-green">
            {stats.activeSessions}
          </div>
          <p className="text-dynamic-muted text-sm">
            {stats.activeSessions > 0
              ? 'Currently in progress'
              : 'No active sessions'}
          </p>
          {stats.activeSessions > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="size-2 animate-pulse rounded-full bg-dynamic-green" />
              <span className="font-medium text-dynamic-green text-sm">
                Live tracking
              </span>
            </div>
          )}
          <div className="mt-4 h-1 rounded-full bg-dynamic-green/20">
            <div
              className="h-1 rounded-full bg-gradient-to-r from-dynamic-green to-dynamic-blue transition-all duration-700"
              style={{ width: stats.activeSessions > 0 ? '100%' : '15%' }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-dynamic-yellow/20 bg-linear-to-br from-dynamic-yellow/5 to-dynamic-orange/5 transition-all duration-300 hover:shadow-dynamic-yellow/10 hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between border-dynamic-yellow/20 border-b bg-gradient-to-r from-dynamic-yellow/10 to-dynamic-orange/10 pb-4">
          <CardTitle className="font-semibold text-dynamic-yellow text-sm">
            Today's Work
          </CardTitle>
          <div className="rounded-lg bg-dynamic-yellow/20 p-2 ring-2 ring-dynamic-yellow/10">
            <Target className="size-4 text-dynamic-yellow" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-2 font-bold text-3xl text-dynamic-yellow">
            {formatDuration(stats.todayTime)}
          </div>
          <p className="text-dynamic-muted text-sm">
            {stats.todaySessions} session
            {stats.todaySessions !== 1 ? 's' : ''} today
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-dynamic-muted">Progress</span>
              <span className="font-medium text-dynamic-yellow">
                {Math.min(
                  100,
                  Math.round((stats.todayTime / (8 * 3600)) * 100)
                )}
                %
              </span>
            </div>
            <div className="h-1 rounded-full bg-dynamic-yellow/20">
              <div
                className="h-1 rounded-full bg-gradient-to-r from-dynamic-yellow to-dynamic-orange transition-all duration-700"
                style={{
                  width: `${Math.min(100, (stats.todayTime / (8 * 3600)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-dynamic-purple/20 bg-linear-to-br from-dynamic-purple/5 to-dynamic-pink/5 transition-all duration-300 hover:shadow-dynamic-purple/10 hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between border-dynamic-purple/20 border-b bg-gradient-to-r from-dynamic-purple/10 to-dynamic-pink/10 pb-4">
          <CardTitle className="font-semibold text-dynamic-purple text-sm">
            {period === 'day'
              ? 'Daily Average'
              : period === 'week'
                ? 'This Week'
                : 'This Month'}
          </CardTitle>
          <div className="rounded-lg bg-dynamic-purple/20 p-2 ring-2 ring-dynamic-purple/10">
            <TrendingUp className="size-4 text-dynamic-purple" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-2 font-bold text-3xl text-dynamic-purple">
            {period === 'day'
              ? formatDuration(
                  stats.totalSessions > 0
                    ? groupedSessions.reduce(
                        (sum, s) => sum + s.totalDuration,
                        0
                      ) / stats.totalSessions
                    : 0
                )
              : period === 'week'
                ? formatDuration(stats.weekTime)
                : formatDuration(stats.monthTime)}
          </div>
          <p className="text-dynamic-muted text-sm">
            {period === 'day'
              ? 'Per session average'
              : `Current ${period} total`}
          </p>
          <div className="mt-4 h-1 rounded-full bg-dynamic-purple/20">
            <div
              className="h-1 rounded-full bg-gradient-to-r from-dynamic-purple to-dynamic-pink transition-all duration-700"
              style={{
                width:
                  period === 'day'
                    ? '75%'
                    : period === 'week'
                      ? `${Math.min(100, (stats.weekTime / (40 * 3600)) * 100)}%`
                      : `${Math.min(100, (stats.monthTime / (160 * 3600)) * 100)}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
