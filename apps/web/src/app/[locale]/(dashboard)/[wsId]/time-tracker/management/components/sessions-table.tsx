'use client';

// Removed unused table imports as we now use grid layout
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Loader2,
  Pause,
  Play,
  Search,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { getInitials } from '@tuturuuu/utils/name-helper';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

// Extend dayjs with duration plugin
dayjs.extend(duration);

interface GroupedSession {
  title: string;
  category: {
    name: string;
    color: string;
  } | null;
  sessions: Array<any>;
  /** Total duration across all sessions (sum of duration_seconds) */
  totalDuration: number;
  /** Duration that falls within the specific period (properly split for overnight sessions) */
  periodDuration?: number;
  firstStartTime: string;
  lastEndTime: string | null;
  status: 'active' | 'paused' | 'completed';
  user: {
    displayName: string | null;
    avatarUrl: string | null;
  };
  period: string;
  sessionCount?: number;
  sessionTitles?: string[];
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface SessionsTableProps {
  sessions: GroupedSession[];
  pagination?: PaginationInfo;
  period: 'day' | 'week' | 'month';
  onViewDetails: (session: GroupedSession) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: string) => void;
  isLoading?: boolean;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onExportCSV?: () => void;
  onExportExcel?: () => void;
}

export default function SessionsTable({
  sessions,
  pagination,
  period,
  onViewDetails,
  onPageChange,
  onLimitChange,
  isLoading = false,
  hasActiveFilters = false,
  onClearFilters,
  onExportCSV,
  onExportExcel,
}: SessionsTableProps) {
  const t = useTranslations('time-tracker.management.sessions');
  const tPeriod = useTranslations('time-tracker.management.period');
  const tStatus = useTranslations('time-tracker.management.status');

  // Helper functions
  const formatDuration = (seconds: number) => {
    const dur = dayjs.duration(seconds, 'seconds');
    const hours = Math.floor(dur.asHours());
    const minutes = dur.minutes();
    const secs = dur.seconds();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (timeString: string) => {
    return dayjs(timeString).format('DD/MM/YYYY, HH:mm:ss');
  };

  const formatPeriodDisplay = (
    periodStr: string,
    periodType: 'day' | 'week' | 'month'
  ) => {
    const now = dayjs();

    if (periodType === 'day') {
      const periodDate = dayjs(periodStr);
      const daysDiff = now.diff(periodDate, 'days');

      if (daysDiff === 0) return tPeriod('today');
      if (daysDiff === 1) return tPeriod('yesterday');
      if (daysDiff === -1) return tPeriod('tomorrow');
      if (daysDiff > 0 && daysDiff <= 7)
        return tPeriod('daysAgo', { count: daysDiff });
      if (daysDiff < 0 && daysDiff >= -7)
        return tPeriod('inDays', { count: Math.abs(daysDiff) });

      return periodDate.format('DD MMM YYYY');
    } else if (periodType === 'week') {
      const weekStart = dayjs(periodStr);
      const weekEnd = weekStart.add(6, 'days');

      if (
        now.isAfter(weekStart.subtract(1, 'day')) &&
        now.isBefore(weekEnd.add(1, 'day'))
      ) {
        return tPeriod('thisWeek', {
          start: weekStart.format('DD MMM'),
          end: weekEnd.format('DD MMM'),
        });
      }

      const weeksDiff = now
        .startOf('week')
        .add(1, 'day')
        .diff(weekStart, 'weeks');
      if (weeksDiff === 1)
        return tPeriod('lastWeek', {
          start: weekStart.format('DD MMM'),
          end: weekEnd.format('DD MMM'),
        });
      if (weeksDiff === -1)
        return tPeriod('nextWeek', {
          start: weekStart.format('DD MMM'),
          end: weekEnd.format('DD MMM'),
        });

      return `${weekStart.format('DD MMM')} - ${weekEnd.format('DD MMM YYYY')}`;
    } else {
      const monthDate = dayjs(periodStr + '-01');

      if (now.isSame(monthDate, 'month') && now.isSame(monthDate, 'year')) {
        return tPeriod('thisMonth', { month: monthDate.format('MMMM YYYY') });
      }

      const monthsDiff = now.startOf('month').diff(monthDate, 'months');
      if (monthsDiff === 1)
        return tPeriod('lastMonth', { month: monthDate.format('MMMM YYYY') });
      if (monthsDiff === -1)
        return tPeriod('nextMonth', { month: monthDate.format('MMMM YYYY') });

      return monthDate.format('MMMM YYYY');
    }
  };

  const getStatusColor = (status: 'active' | 'paused' | 'completed') => {
    switch (status) {
      case 'active':
        return 'bg-dynamic-green/20 text-dynamic-green border-dynamic-green/30';
      case 'paused':
        return 'bg-dynamic-yellow/20 text-dynamic-yellow border-dynamic-yellow/30';
      case 'completed':
        return 'bg-dynamic-blue/20 text-dynamic-blue border-dynamic-blue/30';
      default:
        return 'bg-dynamic-gray/20 text-dynamic-gray border-dynamic-gray/30';
    }
  };

  const getStatusIcon = (status: 'active' | 'paused' | 'completed') => {
    switch (status) {
      case 'active':
        return <Play className="size-3" />;
      case 'paused':
        return <Pause className="size-3" />;
      case 'completed':
        return <Clock className="size-3" />;
      default:
        return <Clock className="size-3" />;
    }
  };

  const sortedSessions = [...sessions].sort((a, b) =>
    b.period.localeCompare(a.period)
  );

  return (
    <Card className="overflow-hidden border-dynamic-blue/20 transition-all duration-300">
      <CardHeader className="border-dynamic-blue/20 border-b bg-linear-to-r from-dynamic-blue/5 to-dynamic-purple/5 p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-dynamic-foreground">
            <div className="rounded-lg bg-dynamic-blue/10 p-2 text-dynamic-blue">
              <Clock className="size-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                {t('title')}
                <Badge
                  variant="secondary"
                  className="bg-dynamic-blue/10 text-dynamic-blue"
                >
                  {sortedSessions.length}{' '}
                  {period === 'day'
                    ? t('days')
                    : period === 'week'
                      ? t('weeks')
                      : t('months')}
                </Badge>
              </div>
              {pagination && (
                <p className="font-normal text-dynamic-muted text-sm">
                  {t('showing', {
                    start: (pagination.page - 1) * pagination.limit + 1,
                    end: Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    ),
                    total: pagination.total,
                  })}
                </p>
              )}
            </div>
          </CardTitle>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <Badge
                variant="outline"
                className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue transition-all hover:bg-dynamic-blue/20"
              >
                <Filter className="mr-1 size-3" />
                {t('filtered')}
              </Badge>
            )}

            {/* Export Dropdown */}
            {(onExportCSV || onExportExcel) && sortedSessions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    className="border-dynamic-green/20 text-dynamic-green transition-all duration-200 hover:border-dynamic-green/30 hover:bg-dynamic-green/10"
                  >
                    <Download className="mr-2 size-4" />
                    {t('export')}
                    <ChevronDown className="ml-2 size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {onExportExcel && (
                    <DropdownMenuItem
                      onClick={onExportExcel}
                      className="cursor-pointer transition-colors hover:bg-dynamic-green/10"
                    >
                      <FileSpreadsheet className="mr-2 size-4 text-dynamic-green" />
                      {t('exportExcel')}
                    </DropdownMenuItem>
                  )}
                  {onExportCSV && (
                    <DropdownMenuItem
                      onClick={onExportCSV}
                      className="cursor-pointer transition-colors hover:bg-dynamic-blue/10"
                    >
                      <FileSpreadsheet className="mr-2 size-4 text-dynamic-blue" />
                      {t('exportCSV')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading && sortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="mb-4 size-8 animate-spin text-dynamic-muted" />
            <p className="text-dynamic-muted">{t('loadingSessions')}</p>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/10 to-dynamic-purple/10">
              {hasActiveFilters ? (
                <Search className="size-10 text-dynamic-blue/60" />
              ) : (
                <Clock className="size-10 text-dynamic-blue/60" />
              )}
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-base text-dynamic-foreground">
                {hasActiveFilters ? t('noMatchingSessions') : t('noSessions')}
              </h3>
              <p className="mx-auto max-w-md text-dynamic-muted text-sm">
                {hasActiveFilters
                  ? t('noMatchingSessionsDescription')
                  : t('noSessionsDescription')}
              </p>
            </div>

            {hasActiveFilters && onClearFilters && (
              <div className="mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                  className="border-dynamic-blue/20 text-dynamic-blue transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/10"
                >
                  <Filter className="mr-2 size-4" />
                  {t('clearAllFilters')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-6">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-4 rounded-lg bg-dynamic-muted/5 px-4 py-3 font-medium text-dynamic-muted text-sm">
              <div className="col-span-3">
                {t('userAnd')}{' '}
                {period === 'day'
                  ? t('date')
                  : period === 'week'
                    ? t('week')
                    : t('month')}
              </div>
              <div className="col-span-2">{t('sessionsHeader')}</div>
              <div className="col-span-2">{t('duration')}</div>
              <div className="col-span-2">{t('timeRange')}</div>
              <div className="col-span-2">{t('statusHeader')}</div>
              <div className="col-span-1">{t('actions')}</div>
            </div>

            {/* Session Rows */}
            <div className="space-y-2">
              {sortedSessions.map((session, index) => {
                const isFirstOfPeriod =
                  index === 0 ||
                  sortedSessions[index - 1]?.period !== session.period;

                return (
                  <div
                    key={`grouped-session-${index}`}
                    className={`group grid grid-cols-12 gap-4 rounded-lg border border-dynamic-border/10 bg-dynamic-background p-4 transition-all duration-200 hover:border-dynamic-blue/20 hover:bg-dynamic-blue/5 hover:shadow-sm ${
                      isFirstOfPeriod
                        ? 'border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/5 to-transparent'
                        : ''
                    }`}
                  >
                    {/* User & Period */}
                    <div className="col-span-3 flex items-center gap-3">
                      <Avatar className="size-11 ring-2 ring-dynamic-blue/10 ring-offset-1 ring-offset-dynamic-background">
                        <AvatarImage
                          src={
                            session.user.avatarUrl ||
                            `https://i.pravatar.cc/40?u=${session.user.displayName}`
                          }
                          alt={session.user.displayName || 'User'}
                        />
                        <AvatarFallback className="bg-linear-to-br from-dynamic-blue/10 to-dynamic-purple/10 text-dynamic-blue">
                          {getInitials(
                            session.user.displayName || 'Unknown User'
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-dynamic-foreground text-sm">
                          {session.user.displayName}
                        </p>
                        <p className="truncate text-dynamic-muted text-xs">
                          {formatPeriodDisplay(session.period, period)}
                        </p>
                      </div>
                    </div>

                    {/* Session Summary */}
                    <div className="col-span-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-dynamic-foreground text-sm">
                            {session.sessions.length}
                          </span>
                          <span className="text-dynamic-muted text-xs">
                            {session.sessions.length !== 1
                              ? t('sessionPlural')
                              : t('sessionSingular')}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(
                            new Set(
                              session.sessions
                                .map((s) => s.title)
                                .filter(Boolean)
                            )
                          )
                            .slice(0, 1)
                            .map((title) => (
                              <Badge
                                key={title}
                                variant="outline"
                                className="line-clamp-1 w-full border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                              >
                                {title}
                              </Badge>
                            ))}
                          {Array.from(
                            new Set(
                              session.sessions
                                .map((s) => s.title)
                                .filter(Boolean)
                            )
                          ).length > 1 && (
                            <Badge
                              variant="outline"
                              className="border-dynamic-muted/30 bg-dynamic-muted/10 text-dynamic-muted text-xs"
                            >
                              +
                              {Array.from(
                                new Set(
                                  session.sessions
                                    .map((s) => s.title)
                                    .filter(Boolean)
                                )
                              ).length - 1}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Duration & Progress */}
                    <div className="col-span-2">
                      <div className="space-y-2">
                        <div className="font-mono font-semibold text-dynamic-foreground">
                          {formatDuration(
                            session.periodDuration ?? session.totalDuration
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-dynamic-muted/20">
                            <div
                              className="h-1.5 rounded-full bg-linear-to-r from-dynamic-blue to-dynamic-purple transition-all duration-300"
                              style={{
                                width: `${Math.min(100, ((session.periodDuration ?? session.totalDuration) / (8 * 3600)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-dynamic-muted text-xs">
                            {Math.round(
                              ((session.periodDuration ??
                                session.totalDuration) /
                                (8 * 3600)) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <p className="text-dynamic-muted text-xs">
                          {t('avg')}{' '}
                          {formatDuration(
                            (session.periodDuration ?? session.totalDuration) /
                              session.sessions.length
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Time Range */}
                    <div className="col-span-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-dynamic-foreground text-xs">
                          <div className="rounded bg-dynamic-green/10 p-0.5">
                            <Play className="size-2 text-dynamic-green" />
                          </div>
                          <span className="truncate">
                            {formatTime(session.firstStartTime)}
                          </span>
                        </div>
                        {session.lastEndTime && (
                          <div className="flex items-center gap-1 text-dynamic-foreground text-xs">
                            <div className="rounded bg-dynamic-red/10 p-0.5">
                              <Pause className="size-2 text-dynamic-red" />
                            </div>
                            <span className="truncate">
                              {formatTime(session.lastEndTime)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <Badge
                        variant="outline"
                        className={`${getStatusColor(session.status)} text-xs`}
                      >
                        {getStatusIcon(session.status)}
                        <span className="capitalize">
                          {tStatus(session.status)}
                        </span>
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-dynamic-blue opacity-0 transition-all duration-200 hover:bg-dynamic-blue/10 hover:text-dynamic-blue group-hover:opacity-100"
                        onClick={() => onViewDetails(session)}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="border-dynamic-border/20 border-t bg-dynamic-muted/5 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="text-dynamic-muted text-sm">
                  {t('itemsPerPage')}
                </span>
                <Select
                  value={pagination.limit.toString()}
                  onValueChange={onLimitChange}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-20 border-dynamic-border/20 transition-colors hover:border-dynamic-blue/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isLoading}
                  className="border-dynamic-border/20 transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/10 disabled:opacity-50"
                >
                  <ChevronLeft className="size-4" />
                  {t('previous')}
                </Button>

                <div className="flex items-center gap-2 rounded-lg bg-dynamic-background px-3 py-1.5">
                  <span className="text-dynamic-muted text-sm">
                    {t('pageOf', {
                      page: pagination.page,
                      pages: pagination.pages,
                    })}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages || isLoading}
                  className="border-dynamic-border/20 transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/10 disabled:opacity-50"
                >
                  {t('next')}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
