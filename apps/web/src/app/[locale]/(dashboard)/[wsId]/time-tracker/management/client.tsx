'use client';

import type { TimeTrackingSession } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { getInitials } from '@tuturuuu/utils/name-helper';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Pause,
  Play,
  Search,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

// Extend dayjs with duration plugin
dayjs.extend(duration);

interface GroupedSession {
  title: string;
  category: {
    name: string;
    color: string;
  } | null;
  sessions: TimeTrackingSession[]; // All sessions in this stack
  totalDuration: number; // Sum of all durations
  firstStartTime: string; // Earliest start time (dd/mm/yyyy HH:mm:ss)
  lastEndTime: string | null; // Latest end time (dd/mm/yyyy HH:mm:ss)
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

interface DayGroup {
  label: string;
  sessions: TimeTrackingSession[];
}

interface WeekGroup {
  label: string;
  days?: Record<string, DayGroup>;
  sessions?: TimeTrackingSession[];
}

interface MonthGroup {
  label: string;
  weeks?: Record<string, WeekGroup>;
  sessions?: TimeTrackingSession[];
}

interface GroupedSessionsHierarchy {
  [month: string]: MonthGroup;
}

export default function TimeTrackerManagementClient({
  groupedSessions,
  pagination,
  stats,
  currentPeriod,
}: {
  groupedSessions: GroupedSession[];
  pagination?: PaginationInfo;
  stats?: TimeTrackingStats;
  currentPeriod?: 'day' | 'week' | 'month';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period =
    currentPeriod ||
    (searchParams.get('period') as 'day' | 'week' | 'month') ||
    'day';

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get('search') || ''
  );
  const [selectedSession, setSelectedSession] = useState<GroupedSession | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Helper function to format duration in HH:MM:SS
  const formatDuration = (seconds: number) => {
    const dur = dayjs.duration(seconds, 'seconds');
    const hours = Math.floor(dur.asHours());
    const minutes = dur.minutes();
    const secs = dur.seconds();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper function to format time
  const formatTime = (timeString: string) => {
    return dayjs(timeString).format('DD/MM/YYYY, HH:mm:ss');
  };

  // Helper function to format period display
  const formatPeriodDisplay = (
    period: string,
    periodType: 'day' | 'week' | 'month'
  ) => {
    if (periodType === 'day') {
      return dayjs(period).format('DD MMM YYYY');
    } else if (periodType === 'week') {
      // For week, the period is the Monday date
      const weekStart = dayjs(period);
      const weekEnd = weekStart.add(6, 'days');
      return `${weekStart.format('DD MMM')} - ${weekEnd.format('DD MMM YYYY')}`;
    } else {
      // For month, period is YYYY-MM format
      return dayjs(period + '-01').format('MMMM YYYY');
    }
  };

  // Helper function to group sessions hierarchically based on period
  const groupSessionsHierarchically = (
    sessions: TimeTrackingSession[]
  ): GroupedSessionsHierarchy => {
    if (!sessions || sessions.length === 0) return {};

    const grouped: GroupedSessionsHierarchy = {};

    sessions.forEach((session) => {
      const sessionDate = dayjs(session.start_time);

      if (period === 'day') {
        // For daily mode: group by day, then by week, then by month
        const day = sessionDate.format('YYYY-MM-DD');
        const weekStart = sessionDate
          .startOf('week')
          .add(1, 'day')
          .format('YYYY-MM-DD'); // Monday start
        const month = sessionDate.format('YYYY-MM');

        // Initialize month if it doesn't exist
        if (!grouped[month]) {
          grouped[month] = {
            label: sessionDate.format('MMMM YYYY'),
            weeks: {},
          };
        }

        // Initialize week if it doesn't exist
        if (grouped[month].weeks && !grouped[month].weeks[weekStart]) {
          const weekEnd = dayjs(weekStart).add(6, 'days');
          grouped[month].weeks[weekStart] = {
            label: `${dayjs(weekStart).format('DD MMM')} - ${weekEnd.format('DD MMM')}`,
            days: {},
          };
        }

        // Initialize day if it doesn't exist
        const weekData = grouped[month].weeks?.[weekStart];
        if (weekData?.days && !weekData.days[day]) {
          weekData.days[day] = {
            label: sessionDate.format('DD MMM YYYY'),
            sessions: [],
          };
        }

        // Add session to day
        weekData?.days?.[day]?.sessions.push(session);
      } else if (period === 'week') {
        // For weekly mode: group by month
        const month = sessionDate.format('YYYY-MM');
        const weekStart = sessionDate
          .startOf('week')
          .add(1, 'day')
          .format('YYYY-MM-DD');

        if (!grouped[month]) {
          grouped[month] = {
            label: sessionDate.format('MMMM YYYY'),
            weeks: {},
          };
        }

        if (grouped[month].weeks && !grouped[month].weeks[weekStart]) {
          const weekEnd = dayjs(weekStart).add(6, 'days');
          grouped[month].weeks[weekStart] = {
            label: `${dayjs(weekStart).format('DD MMM')} - ${weekEnd.format('DD MMM')}`,
            sessions: [],
          };
        }

        grouped[month].weeks?.[weekStart]?.sessions?.push(session);
      } else {
        // For monthly mode: group by month
        const month = sessionDate.format('YYYY-MM');

        if (!grouped[month]) {
          grouped[month] = {
            label: sessionDate.format('MMMM YYYY'),
            sessions: [],
          };
        }

        grouped[month].sessions?.push(session);
      }
    });

    return grouped;
  };

  // Navigation helper functions
  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.push(`?${params.toString()}`);
  };

  const handlePeriodChange = (newPeriod: 'day' | 'week' | 'month') => {
    updateSearchParams({ period: newPeriod, page: '1' }); // Reset to page 1 when changing period
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    updateSearchParams({ search: query || null, page: '1' }); // Reset to page 1 when searching
  };

  const handlePageChange = (newPage: number) => {
    updateSearchParams({ page: newPage.toString() });
  };

  const handleLimitChange = (newLimit: string) => {
    updateSearchParams({ limit: newLimit, page: '1' }); // Reset to page 1 when changing limit
  };

  // Use provided stats or calculate from grouped sessions
  const displayStats = stats || {
    totalSessions: groupedSessions.length,
    activeSessions: groupedSessions.filter((s) => s.status === 'active').length,
    activeUsers: Array.from(
      new Set(groupedSessions.map((s) => s.user.displayName))
    ).length,
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    todaySessions: 0,
    weekSessions: 0,
    monthSessions: 0,
    streak: 0,
  };

  const sortedSessions = [...groupedSessions].sort((a, b) =>
    b.period.localeCompare(a.period)
  );

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

  const handleViewDetails = (session: GroupedSession) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4 border-dynamic-border/20 border-b pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-2xl text-dynamic-foreground">
              Time Tracker Management
            </h2>
            <p className="mt-1 text-dynamic-muted text-sm">
              Monitor and analyze team productivity across time periods
            </p>
          </div>
          <div className="flex items-center gap-2 text-dynamic-muted text-sm">
            <div className="flex items-center gap-1 rounded-full bg-dynamic-green/10 px-3 py-1">
              <div className="size-2 animate-pulse rounded-full bg-dynamic-green" />
              Live Dashboard
            </div>
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                Total{' '}
                {period === 'day'
                  ? 'Daily'
                  : period === 'week'
                    ? 'Weekly'
                    : 'Monthly'}{' '}
                Sessions
              </CardTitle>
              <div className="rounded-full bg-dynamic-blue/20 p-2">
                <Calendar className="size-4 text-dynamic-blue" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-blue">
                {displayStats.totalSessions}
              </div>
              <p className="mt-1 text-dynamic-muted text-xs">
                {displayStats.totalSessions > 0
                  ? `Across ${displayStats.activeUsers} user${displayStats.activeUsers === 1 ? '' : 's'}`
                  : 'No sessions yet'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-dynamic-green/20 bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                Active Sessions
              </CardTitle>
              <div className="rounded-full bg-dynamic-green/20 p-2">
                <Play className="size-4 text-dynamic-green" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-green">
                {displayStats.activeSessions}
              </div>
              <p className="mt-1 text-dynamic-muted text-xs">
                {displayStats.activeSessions > 0
                  ? 'Currently in progress'
                  : 'No active sessions'}
              </p>
              {displayStats.activeSessions > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-1">
                    <div className="size-2 animate-pulse rounded-full bg-dynamic-green" />
                    <span className="text-dynamic-green text-xs">
                      Live tracking
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dynamic-yellow/20 bg-gradient-to-br from-dynamic-yellow/5 to-dynamic-yellow/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                Today's Work
              </CardTitle>
              <div className="rounded-full bg-dynamic-yellow/20 p-2">
                <Target className="size-4 text-dynamic-yellow" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-yellow">
                {formatDuration(displayStats.todayTime)}
              </div>
              <p className="mt-1 text-dynamic-muted text-xs">
                {displayStats.todaySessions} session
                {displayStats.todaySessions !== 1 ? 's' : ''} today
              </p>
              <div className="mt-2 h-1 rounded-full bg-dynamic-yellow/20">
                <div
                  className="h-1 rounded-full bg-dynamic-yellow transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (displayStats.todayTime / (8 * 3600)) * 100)}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dynamic-purple/20 bg-gradient-to-br from-dynamic-purple/5 to-dynamic-purple/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                {period === 'day'
                  ? 'Daily Average'
                  : period === 'week'
                    ? 'This Week'
                    : 'This Month'}
              </CardTitle>
              <div className="rounded-full bg-dynamic-purple/20 p-2">
                <TrendingUp className="size-4 text-dynamic-purple" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-purple">
                {period === 'day'
                  ? formatDuration(
                      displayStats.totalSessions > 0
                        ? groupedSessions.reduce(
                            (sum, s) => sum + s.totalDuration,
                            0
                          ) / displayStats.totalSessions
                        : 0
                    )
                  : period === 'week'
                    ? formatDuration(displayStats.weekTime)
                    : formatDuration(displayStats.monthTime)}
              </div>
              <p className="mt-1 text-dynamic-muted text-xs">
                {period === 'day'
                  ? 'Per session average'
                  : `Current ${period} total`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main content */}
      <div>
        <div className="space-y-4">
          {/* Enhanced Filters and Controls */}
          <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-sm">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 transform text-dynamic-muted" />
              <Input
                placeholder="Search by user, category, or session title..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="border-dynamic-border/20 bg-dynamic-muted/5 pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-dynamic-muted" />
              <Select value={period} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily View</SelectItem>
                  <SelectItem value="week">Weekly View</SelectItem>
                  <SelectItem value="month">Monthly View</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-dynamic-muted text-sm">
              <Users className="size-4" />
              <span>
                {displayStats.activeUsers} active user
                {displayStats.activeUsers === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Pagination and Results Info */}
          {pagination && (
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-dynamic-muted text-sm">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{' '}
                of {pagination.total} results
              </div>

              <div className="flex items-center gap-4">
                {/* Items per page selector */}
                <div className="flex items-center gap-2">
                  <span className="text-dynamic-muted text-sm">Per page:</span>
                  <Select
                    value={pagination.limit.toString()}
                    onValueChange={handleLimitChange}
                  >
                    <SelectTrigger className="w-20">
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

                {/* Page navigation */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>

                  <span className="text-dynamic-muted text-sm">
                    Page {pagination.page} of {pagination.pages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Sessions Table */}
          <Card className="border-dynamic-border/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-dynamic-foreground">
                <Clock className="size-5" />
                Time Tracking Sessions
                <Badge variant="secondary" className="ml-2">
                  {sortedSessions.length}{' '}
                  {period === 'day'
                    ? 'days'
                    : period === 'week'
                      ? 'weeks'
                      : 'months'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-dynamic-border/20 bg-dynamic-muted/5">
                    <TableHead className="text-dynamic-muted">
                      User & Period
                    </TableHead>
                    <TableHead className="text-dynamic-muted">
                      Sessions & Activities
                    </TableHead>
                    <TableHead className="text-dynamic-muted">
                      Duration & Progress
                    </TableHead>
                    <TableHead className="text-dynamic-muted">
                      Time Range
                    </TableHead>
                    <TableHead className="text-dynamic-muted">Status</TableHead>
                    <TableHead className="w-16 text-dynamic-muted">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSessions.map((session, index) => (
                    <TableRow
                      // biome-ignore lint: false positive
                      key={`grouped-session-${index}`}
                      className="group hover:bg-dynamic-muted/3"
                    >
                      {/* Period & User */}
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10">
                            <AvatarImage
                              src={
                                session.user.avatarUrl ||
                                `https://i.pravatar.cc/40?u=${session.user.displayName}`
                              }
                              alt={session.user.displayName || 'User'}
                            />
                            <AvatarFallback>
                              {getInitials(
                                session.user.displayName || 'Unknown User'
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-dynamic-foreground">
                              {session.user.displayName}
                            </p>
                            <p className="text-dynamic-muted text-sm">
                              {formatPeriodDisplay(session.period, period)}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Session Summary */}
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-dynamic-foreground">
                              {session.sessions.length} session
                              {session.sessions.length !== 1 ? 's' : ''}
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
                              .slice(0, 2)
                              .map((title) => (
                                <Badge
                                  key={title}
                                  variant="outline"
                                  className="border-dynamic-border/30 bg-dynamic-muted/20 text-xs"
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
                            ).length > 2 && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-border/30 bg-dynamic-muted/20 text-xs"
                              >
                                +
                                {Array.from(
                                  new Set(
                                    session.sessions
                                      .map((s) => s.title)
                                      .filter(Boolean)
                                  )
                                ).length - 2}{' '}
                                more
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Duration & Progress */}
                      <TableCell>
                        <div className="space-y-2">
                          <div className="font-medium font-mono text-dynamic-foreground text-lg">
                            {formatDuration(session.totalDuration)}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-dynamic-muted/20">
                              <div
                                className="h-2 rounded-full bg-dynamic-blue transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, (session.totalDuration / (8 * 3600)) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-dynamic-muted text-xs">
                              {Math.round(
                                (session.totalDuration / (8 * 3600)) * 100
                              )}
                              %
                            </span>
                          </div>
                          <p className="text-dynamic-muted text-xs">
                            Avg:{' '}
                            {formatDuration(
                              session.totalDuration / session.sessions.length
                            )}
                          </p>
                        </div>
                      </TableCell>

                      {/* Time Range */}
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-dynamic-foreground text-sm">
                            <Play className="size-3 text-dynamic-green" />
                            {formatTime(session.firstStartTime)}
                          </div>
                          {session.lastEndTime && (
                            <div className="flex items-center gap-1 text-dynamic-foreground text-sm">
                              <Pause className="size-3 text-dynamic-red" />
                              {formatTime(session.lastEndTime)}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusColor(session.status)}
                        >
                          {getStatusIcon(session.status)}
                          {session.status}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-dynamic-blue opacity-0 transition-opacity hover:bg-dynamic-blue/10 hover:text-dynamic-blue group-hover:opacity-100"
                          onClick={() => handleViewDetails(session)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sortedSessions.length === 0 && (
                <div className="p-12 text-center">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-dynamic-muted/10">
                    <Clock className="size-8 text-dynamic-muted" />
                  </div>
                  <h3 className="mb-2 font-semibold text-dynamic-foreground text-lg">
                    No sessions found
                  </h3>
                  <p className="mx-auto max-w-sm text-dynamic-muted">
                    {searchQuery ? (
                      <>
                        No sessions match your search criteria. Try adjusting
                        your filters or search terms.
                      </>
                    ) : (
                      <>
                        No time tracking sessions have been recorded yet.
                        Sessions will appear here once users start tracking
                        their time.
                      </>
                    )}
                  </p>
                  {searchQuery && (
                    <Button
                      variant="outline"
                      onClick={() => setSearchQuery('')}
                      className="mt-4"
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Enhanced Session Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-2xl flex-col overflow-hidden sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl">
          <DialogHeader className="flex-shrink-0 border-dynamic-border/20 border-b pb-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 border border-dynamic-border/20 sm:size-12">
                <AvatarImage
                  src={selectedSession?.user.avatarUrl || undefined}
                  alt={selectedSession?.user.displayName || 'User'}
                />
                <AvatarFallback className="bg-dynamic-muted/10 font-medium text-dynamic-foreground text-sm">
                  {getInitials(
                    selectedSession?.user.displayName || 'Unknown User'
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-dynamic-foreground text-lg sm:text-xl">
                  {selectedSession?.user.displayName || 'Unknown User'} - Time
                  Tracking Details
                </DialogTitle>
                <p className="text-dynamic-muted text-sm">
                  {selectedSession &&
                    formatPeriodDisplay(selectedSession.period, period)}
                </p>
              </div>
            </div>
          </DialogHeader>

          {selectedSession && (
            <div className="flex-1 space-y-6 overflow-y-auto p-1">
              {/* Session Overview Cards */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className="border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-4">
                  <div className="text-center">
                    <div className="font-bold text-2xl text-dynamic-blue">
                      {selectedSession.sessions.length}
                    </div>
                    <div className="text-dynamic-muted text-sm">
                      Total Sessions
                    </div>
                  </div>
                </Card>
                <Card className="border-dynamic-green/20 bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10 p-4">
                  <div className="text-center">
                    <div className="font-bold text-2xl text-dynamic-green">
                      {formatDuration(selectedSession.totalDuration)}
                    </div>
                    <div className="text-dynamic-muted text-sm">Total Time</div>
                  </div>
                </Card>
                <Card className="border-dynamic-yellow/20 bg-gradient-to-br from-dynamic-yellow/5 to-dynamic-yellow/10 p-4">
                  <div className="text-center">
                    <div className="font-bold text-2xl text-dynamic-yellow">
                      {formatDuration(
                        selectedSession.totalDuration /
                          selectedSession.sessions.length
                      )}
                    </div>
                    <div className="text-dynamic-muted text-sm">
                      Avg Session
                    </div>
                  </div>
                </Card>
                <Card className="border-dynamic-purple/20 bg-gradient-to-br from-dynamic-purple/5 to-dynamic-purple/10 p-4">
                  <div className="text-center">
                    <div className="font-bold text-2xl text-dynamic-purple">
                      {
                        selectedSession.sessions.filter((s) => s.is_running)
                          .length
                      }
                    </div>
                    <div className="text-dynamic-muted text-sm">Active Now</div>
                  </div>
                </Card>
              </div>

              {/* Session Summary */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card className="border-dynamic-border/20 p-4">
                  <h4 className="mb-3 font-semibold text-dynamic-foreground">
                    Session Breakdown
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-dynamic-muted">Period:</span>
                      <span className="font-medium text-dynamic-foreground">
                        {formatPeriodDisplay(selectedSession.period, period)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dynamic-muted">First Session:</span>
                      <span className="font-medium text-dynamic-foreground">
                        {formatTime(selectedSession.firstStartTime)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dynamic-muted">Last Session:</span>
                      <span className="font-medium text-dynamic-foreground">
                        {selectedSession.lastEndTime
                          ? formatTime(selectedSession.lastEndTime)
                          : 'In Progress'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dynamic-muted">Status:</span>
                      <Badge
                        variant="outline"
                        className={getStatusColor(selectedSession.status)}
                      >
                        {getStatusIcon(selectedSession.status)}
                        {selectedSession.status}
                      </Badge>
                    </div>
                  </div>
                </Card>

                <Card className="border-dynamic-border/20 p-4">
                  <h4 className="mb-3 font-semibold text-dynamic-foreground">
                    Productivity Insights
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-dynamic-muted">
                          Daily Goal Progress
                        </span>
                        <span className="text-dynamic-foreground">
                          {Math.round(
                            (selectedSession.totalDuration / (8 * 3600)) * 100
                          )}
                          %
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-dynamic-muted/20">
                        <div
                          className="h-2 rounded-full bg-dynamic-blue transition-all duration-300"
                          style={{
                            width: `${Math.min(100, (selectedSession.totalDuration / (8 * 3600)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-dynamic-muted">
                          Shortest Session:
                        </span>
                        <span className="text-dynamic-foreground">
                          {formatDuration(
                            Math.min(
                              ...selectedSession.sessions
                                .filter((s) => s.duration_seconds)
                                .map((s) => s.duration_seconds || 0)
                            )
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-dynamic-muted">
                          Longest Session:
                        </span>
                        <span className="text-dynamic-foreground">
                          {formatDuration(
                            Math.max(
                              ...selectedSession.sessions
                                .filter((s) => s.duration_seconds)
                                .map((s) => s.duration_seconds || 0)
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Hierarchical Sessions Display */}
              <div>
                <h4 className="mb-3 font-semibold text-dynamic-foreground">
                  Individual Sessions ({selectedSession.sessions.length})
                </h4>

                {(() => {
                  const groupedData = groupSessionsHierarchically(
                    selectedSession.sessions
                  );

                  return (
                    <div className="space-y-4">
                      {Object.entries(groupedData).map(
                        ([monthKey, monthData]) => (
                          <div
                            key={monthKey}
                            className="rounded-lg border border-dynamic-border/20 bg-dynamic-muted/5 p-4"
                          >
                            <h5 className="mb-3 font-medium text-dynamic-foreground">
                              {monthData.label}
                            </h5>

                            {period === 'month' && monthData.sessions ? (
                              /* Monthly view - show sessions directly */
                              <div className="space-y-2">
                                {monthData.sessions
                                  .sort(
                                    (a, b) =>
                                      new Date(b.start_time).getTime() -
                                      new Date(a.start_time).getTime()
                                  )
                                  .map((session) => (
                                    <div
                                      key={session.id}
                                      className="flex items-center justify-between rounded-md border border-dynamic-border/10 bg-dynamic-background p-3"
                                    >
                                      <div className="flex-1">
                                        <div className="font-medium text-dynamic-foreground">
                                          {session.title}
                                        </div>
                                        <div className="text-dynamic-muted text-sm">
                                          {session.description ||
                                            'No description'}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-mono text-dynamic-foreground text-sm">
                                          {session.duration_seconds
                                            ? formatDuration(
                                                session.duration_seconds
                                              )
                                            : 'Running...'}
                                        </div>
                                        <div className="text-dynamic-muted text-xs">
                                          {formatTime(session.start_time)}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : period === 'week' && monthData.weeks ? (
                              /* Weekly view - show weeks then sessions */
                              <div className="space-y-3">
                                {Object.entries(monthData.weeks).map(
                                  ([weekKey, weekData]) => (
                                    <div
                                      key={weekKey}
                                      className="rounded-md border border-dynamic-border/10 bg-dynamic-background p-3"
                                    >
                                      <h6 className="mb-2 font-medium text-dynamic-foreground text-sm">
                                        {weekData.label}
                                      </h6>
                                      {weekData.sessions && (
                                        <div className="space-y-2">
                                          {weekData.sessions
                                            .sort(
                                              (a, b) =>
                                                new Date(
                                                  b.start_time
                                                ).getTime() -
                                                new Date(a.start_time).getTime()
                                            )
                                            .map((session) => (
                                              <div
                                                key={session.id}
                                                className="flex items-center justify-between rounded border border-dynamic-border/5 bg-dynamic-muted/10 p-2"
                                              >
                                                <div className="flex-1">
                                                  <div className="font-medium text-dynamic-foreground text-sm">
                                                    {session.title}
                                                  </div>
                                                  <div className="text-dynamic-muted text-xs">
                                                    {session.description ||
                                                      'No description'}
                                                  </div>
                                                </div>
                                                <div className="text-right">
                                                  <div className="font-mono text-dynamic-foreground text-xs">
                                                    {session.duration_seconds
                                                      ? formatDuration(
                                                          session.duration_seconds
                                                        )
                                                      : 'Running...'}
                                                  </div>
                                                  <div className="text-dynamic-muted text-xs">
                                                    {formatTime(
                                                      session.start_time
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : monthData.weeks ? (
                              /* Daily view - show weeks, then days, then sessions */
                              <div className="space-y-3">
                                {Object.entries(monthData.weeks).map(
                                  ([weekKey, weekData]) => (
                                    <div
                                      key={weekKey}
                                      className="rounded-md border border-dynamic-border/10 bg-dynamic-background p-3"
                                    >
                                      <h6 className="mb-2 font-medium text-dynamic-foreground text-sm">
                                        {weekData.label}
                                      </h6>
                                      {weekData.days && (
                                        <div className="space-y-2">
                                          {Object.entries(weekData.days).map(
                                            ([dayKey, dayData]) => (
                                              <div
                                                key={dayKey}
                                                className="rounded border border-dynamic-border/5 bg-dynamic-muted/10 p-2"
                                              >
                                                <div className="mb-2 font-medium text-dynamic-foreground text-sm">
                                                  {dayData.label}
                                                </div>
                                                <div className="space-y-1">
                                                  {dayData.sessions
                                                    .sort(
                                                      (a, b) =>
                                                        new Date(
                                                          b.start_time
                                                        ).getTime() -
                                                        new Date(
                                                          a.start_time
                                                        ).getTime()
                                                    )
                                                    .map((session) => (
                                                      <div
                                                        key={session.id}
                                                        className="flex items-center justify-between rounded bg-dynamic-background p-2"
                                                      >
                                                        <div className="flex-1">
                                                          <div className="font-medium text-dynamic-foreground text-sm">
                                                            {session.title}
                                                          </div>
                                                          <div className="text-dynamic-muted text-xs">
                                                            {session.description ||
                                                              'No description'}
                                                          </div>
                                                        </div>
                                                        <div className="text-right">
                                                          <div className="font-mono text-dynamic-foreground text-xs">
                                                            {session.duration_seconds
                                                              ? formatDuration(
                                                                  session.duration_seconds
                                                                )
                                                              : 'Running...'}
                                                          </div>
                                                          <div className="text-dynamic-muted text-xs">
                                                            {formatTime(
                                                              session.start_time
                                                            )}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    ))}
                                                </div>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : null}
                          </div>
                        )
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
