'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart2,
  Brain,
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Edit,
  ExternalLink,
  Filter,
  History,
  Layers,
  MapPin,
  MoreHorizontal,
  Move,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory, WorkspaceTask } from '@tuturuuu/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Collapsible, CollapsibleContent } from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import type { SessionWithRelations } from '../types';
import MissedEntryDialog from './missed-entry-dialog';
import { WorkspaceSelectDialog } from './workspace-select-dialog';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

interface SessionHistoryProps {
  wsId: string;
  sessions: SessionWithRelations[] | null;
  categories: TimeTrackingCategory[] | null;
  tasks:
    | (Partial<WorkspaceTask> & {
        board_name?: string;
        list_name?: string;
      })[]
    | null;
}

type ViewMode = 'day' | 'week' | 'month';

interface StackedSession {
  id: string;
  title: string;
  description?: string;
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
  sessions: SessionWithRelations[]; // All sessions in this stack
  totalDuration: number; // Sum of all durations
  firstStartTime: string; // Earliest start time
  lastEndTime: string | null; // Latest end time
}

// Utility function to stack sessions by day/month, name, and category
const stackSessions = (
  sessions: SessionWithRelations[] | undefined,
  viewMode: ViewMode
): StackedSession[] => {
  if (!sessions || sessions.length === 0) return [];

  const userTimezone = dayjs.tz.guess();

  // Group sessions based on view mode
  const groups: { [key: string]: SessionWithRelations[] } = {};

  sessions?.forEach((session) => {
    const sessionDate = dayjs.utc(session.start_time).tz(userTimezone);
    let groupKey: string;

    if (viewMode === 'month') {
      // For month view, group by name and category only (ignore day)
      groupKey = `${session.title}-${session.category_id || 'none'}-${session.task_id || 'none'}`;
    } else {
      // For day/week view, group by day + name + category + task
      const dateKey = sessionDate.format('YYYY-MM-DD');
      groupKey = `${dateKey}-${session.title}-${session.category_id || 'none'}-${session.task_id || 'none'}`;
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey]?.push(session);
  });

  // Convert groups to stacked sessions
  const stacks: StackedSession[] = [];

  Object.values(groups).forEach((groupSessions) => {
    if (groupSessions.length > 0) {
      // Sort sessions within group by start time
      const sortedSessions = groupSessions.sort((a, b) =>
        dayjs(a.start_time).diff(dayjs(b.start_time))
      );
      const newStack = createStackedSession(sortedSessions);
      if (newStack) stacks.push(newStack);
    }
  });

  return stacks;
};

export const formatDuration = (seconds: number | undefined): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to create a stacked session object
const createStackedSession = (
  sessions: SessionWithRelations[]
): StackedSession | null => {
  if (sessions.length === 0) {
    throw new Error('Cannot create stacked session from empty array');
  }

  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.duration_seconds || 0),
    0
  );
  const sortedSessions = sessions.sort((a, b) =>
    dayjs(a.start_time).diff(dayjs(b.start_time))
  );
  const firstSession = sortedSessions[0];
  const lastSession = sortedSessions[sortedSessions.length - 1];

  if (!firstSession || !lastSession) {
    return null;
  }

  return {
    id: firstSession.id,
    title: firstSession.title,
    description: firstSession.description || undefined,
    category: firstSession.category,
    task: firstSession.task,
    sessions: sortedSessions,
    totalDuration,
    firstStartTime: firstSession.start_time,
    lastEndTime: lastSession.end_time,
  };
};

export const getCategoryColor = (color: string) => {
  const colorMap: Record<string, string> = {
    RED: 'bg-red-500',
    BLUE: 'bg-blue-500',
    GREEN: 'bg-green-500',
    YELLOW: 'bg-yellow-500',
    ORANGE: 'bg-orange-500',
    PURPLE: 'bg-purple-500',
    PINK: 'bg-pink-500',
    INDIGO: 'bg-indigo-500',
    CYAN: 'bg-cyan-500',
    GRAY: 'bg-gray-500',
  };
  return colorMap[color] || 'bg-blue-500';
};

const StackedSessionItem = ({
  stackedSession,
  onResume,
  onEdit,
  onDelete,
  onMove,
  actionStates,
  tasks,
}: {
  stackedSession: StackedSession | null;
  onResume: (session: SessionWithRelations) => void;
  onEdit: (session: SessionWithRelations) => void;
  onDelete: (session: SessionWithRelations) => void;
  onMove: (session: SessionWithRelations) => void;
  actionStates: { [key: string]: boolean };
  tasks:
    | (Partial<WorkspaceTask> & {
        board_name?: string;
        list_name?: string;
      })[]
    | null;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const userTimezone = dayjs.tz.guess();
  const firstStartTime = dayjs
    .utc(stackedSession?.firstStartTime)
    .tz(userTimezone);
  const lastEndTime = stackedSession?.lastEndTime
    ? dayjs.utc(stackedSession?.lastEndTime).tz(userTimezone)
    : null;

  const latestSession =
    stackedSession?.sessions[stackedSession?.sessions.length - 1];

  if (!latestSession) {
    return null;
  }

  // Limit how many sessions to show initially
  const INITIAL_SESSION_LIMIT = 3;
  const hasMoreSessions =
    stackedSession?.sessions.length > INITIAL_SESSION_LIMIT;
  const visibleSessions = showAllSessions
    ? stackedSession?.sessions
    : stackedSession?.sessions.slice(0, INITIAL_SESSION_LIMIT);

  return (
    <div className="group rounded-xl border border-border/60 bg-linear-to-br from-background to-muted/5 shadow-sm transition-all hover:border-border hover:shadow-md">
      <div className="p-3 md:p-5">
        {/* Mobile-optimized layout */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="min-w-0 flex-1 space-y-2 md:space-y-2.5">
            {/* Title row with duration on mobile */}
            <div className="flex items-start justify-between gap-2">
              <h4 className="wrap-break-word min-w-0 flex-1 font-semibold text-base leading-tight md:text-lg">
                {stackedSession?.title}
              </h4>
              {/* Duration badge - visible on mobile */}
              <div className="shrink-0 rounded-lg bg-dynamic-orange/10 px-2.5 py-1 ring-1 ring-dynamic-orange/20 md:hidden">
                <div className="font-bold font-mono text-dynamic-orange text-sm">
                  {formatDuration(stackedSession?.totalDuration)}
                </div>
              </div>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              {stackedSession?.sessions.length > 1 && (
                <Badge
                  variant="secondary"
                  className="shrink-0 font-medium text-xs shadow-sm"
                >
                  <Layers className="mr-1 h-3 w-3" />
                  {stackedSession?.sessions.length}
                </Badge>
              )}
              {/* Show manual entry badge if any session in the stack is a manual entry */}
              {stackedSession?.sessions.some(
                (s) =>
                  s.start_time &&
                  s.end_time &&
                  !s.is_running &&
                  s.duration_seconds
              ) &&
                stackedSession?.sessions.some((s) => {
                  const sessionStart = s.start_time
                    ? dayjs(s.start_time)
                    : null;
                  const sessionEnd = s.end_time ? dayjs(s.end_time) : null;
                  const sessionCreated = dayjs(s.created_at);

                  // If session was created after it ended, it's likely a manual entry
                  return (
                    sessionEnd &&
                    !sessionStart?.isSame(sessionCreated, 'minute')
                  );
                }) && (
                  <Badge
                    variant="outline"
                    className="border-dynamic-orange/20 bg-dynamic-orange/10 font-medium text-dynamic-orange text-xs"
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    Manual
                  </Badge>
                )}
            </div>

            {/* Description */}
            {stackedSession?.description && (
              <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
                {getDescriptionText(stackedSession.description)}
              </p>
            )}

            {/* Category and Task */}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              {stackedSession?.category && (
                <Badge
                  className={cn(
                    'shrink-0 font-medium text-white text-xs shadow-sm',
                    getCategoryColor(stackedSession?.category.color || 'BLUE')
                  )}
                >
                  {stackedSession?.category.name}
                </Badge>
              )}
              {stackedSession?.task && (
                <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                  <CheckCircle className="h-3 w-3 shrink-0 text-dynamic-blue" />
                  <span className="truncate font-medium text-dynamic-blue text-xs">
                    {stackedSession?.task.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-3 w-3 shrink-0 p-0 text-dynamic-blue/60 hover:text-dynamic-blue"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                <span>
                  {stackedSession?.sessions.length > 1 ? (
                    <>
                      {firstStartTime.format('MMM D')}
                      {lastEndTime &&
                        !firstStartTime.isSame(lastEndTime, 'day') && (
                          <span> - {lastEndTime.format('MMM D')}</span>
                        )}
                      <span className="ml-1">
                        ({stackedSession?.sessions.length} sessions)
                      </span>
                      {stackedSession?.sessions.some((s) => s.is_running) && (
                        <span className="font-medium text-green-600">
                          {' '}
                          • ongoing
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {firstStartTime.format('MMM D')} at{' '}
                      {firstStartTime.format('h:mm A')}
                      {lastEndTime ? (
                        <span> - {lastEndTime.format('h:mm A')}</span>
                      ) : stackedSession?.sessions.some((s) => s.is_running) ? (
                        <span className="font-medium text-green-600">
                          {' '}
                          - ongoing
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Time display - responsive */}
            <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="break-all">
                {stackedSession?.sessions.length > 1 ? (
                  <>
                    {firstStartTime.format('MMM D')}
                    {lastEndTime &&
                      !firstStartTime.isSame(lastEndTime, 'day') && (
                        <span> - {lastEndTime.format('MMM D')}</span>
                      )}
                  </>
                ) : (
                  <>
                    {firstStartTime.format('MMM D')} •{' '}
                    {firstStartTime.format('h:mm A')}
                    {lastEndTime && (
                      <span> - {lastEndTime.format('h:mm A')}</span>
                    )}
                  </>
                )}
                {stackedSession?.sessions.some((s) => s.is_running) && (
                  <Badge
                    variant="secondary"
                    className="ml-1 inline-flex text-xs"
                  >
                    <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    Active
                  </Badge>
                )}
              </span>
            </div>

            {/* Task location */}
            {stackedSession?.task &&
              (() => {
                const taskWithDetails = tasks?.find(
                  (t) => t.id === stackedSession?.task?.id
                );
                return taskWithDetails?.board_name &&
                  taskWithDetails?.list_name ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="break-all">
                      {taskWithDetails.board_name} • {taskWithDetails.list_name}
                    </span>
                  </div>
                ) : null;
              })()}
          </div>

          {/* Duration and Actions - desktop only */}
          <div className="hidden items-start gap-2 md:flex">
            <div className="shrink-0 rounded-lg bg-dynamic-orange/10 px-3 py-2 text-right ring-1 ring-dynamic-orange/20">
              <div className="font-bold font-mono text-dynamic-orange text-lg">
                {formatDuration(stackedSession?.totalDuration)}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {stackedSession?.sessions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 transition-all hover:bg-muted md:h-10 md:w-10"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={
                    isExpanded
                      ? 'Hide individual sessions'
                      : 'Show individual sessions'
                  }
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 md:h-5 md:w-5" />
                  ) : (
                    <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 opacity-100 transition-opacity md:h-10 md:w-10 md:opacity-0 md:group-hover:opacity-100"
                    title="More options"
                  >
                    <MoreHorizontal className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onResume(latestSession)}
                    disabled={actionStates[`resume-${latestSession.id}`]}
                  >
                    {actionStates[`resume-${latestSession.id}`] ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Start New Session
                  </DropdownMenuItem>
                  {stackedSession?.sessions.length <= 1 && (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(latestSession)}>
                        <Edit className="h-4 w-4" />
                        Edit Session
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMove(latestSession)}>
                        <Move className="h-4 w-4" />
                        Move to Another Workspace
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(latestSession)}>
                        <Trash2 className="h-4 w-4" />
                        Delete Session
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Mobile action bar */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 md:hidden">
          <div className="flex items-center gap-1.5">
            {stackedSession?.sessions.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 flex-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="mr-1.5 h-4 w-4" />
                    Hide Details
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1.5 h-4 w-4" />
                    Show {stackedSession?.sessions.length} Sessions
                  </>
                )}
              </Button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 px-3">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onResume(latestSession)}
                disabled={actionStates[`resume-${latestSession.id}`]}
              >
                {actionStates[`resume-${latestSession.id}`] ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Start New Session
              </DropdownMenuItem>
              {stackedSession?.sessions.length <= 1 && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(latestSession)}>
                    <Edit className="h-4 w-4" />
                    Edit Session
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove(latestSession)}>
                    <Move className="h-4 w-4" />
                    Move to Another Workspace
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(latestSession)}>
                    <Trash2 className="h-4 w-4" />
                    Delete Session
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {stackedSession?.sessions.length > 1 && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent>
            <div className="border-t bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <Layers className="h-4 w-4" />
                  Individual Sessions ({stackedSession?.sessions.length})
                  {stackedSession?.sessions.length > 1 && (
                    <span className="ml-1 text-xs">
                      •{' '}
                      {
                        new Set(
                          stackedSession?.sessions.map((s) =>
                            dayjs
                              .utc(s.start_time)
                              .tz(userTimezone)
                              .format('MMM D')
                          )
                        ).size
                      }{' '}
                      days
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  {stackedSession?.sessions.filter((s) => s.end_time).length}{' '}
                  completed •{' '}
                  {stackedSession?.sessions.filter((s) => s.is_running).length}{' '}
                  running
                </div>
              </div>
              <div className="space-y-3">
                {/* Sessions container with scroll for many sessions */}
                <div
                  className={cn(
                    'space-y-2 transition-all duration-200',
                    stackedSession?.sessions.length > 6 &&
                      showAllSessions &&
                      'max-h-96 overflow-y-auto pr-2'
                  )}
                >
                  {visibleSessions.map((session, index) => {
                    const sessionStart = dayjs
                      .utc(session.start_time)
                      .tz(userTimezone);
                    const sessionEnd = session.end_time
                      ? dayjs.utc(session.end_time).tz(userTimezone)
                      : null;

                    // Calculate gap from previous session
                    const prevSession =
                      index > 0 ? stackedSession?.sessions[index - 1] : null;

                    const gapInSeconds = prevSession?.end_time
                      ? sessionStart.diff(
                          dayjs.utc(prevSession.end_time).tz(userTimezone),
                          'seconds'
                        )
                      : null;

                    // Format gap duration based on length
                    const formatGap = (seconds: number) => {
                      if (seconds < 60) return `${seconds}s`;
                      if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
                      const hours = Math.floor(seconds / 3600);
                      const mins = Math.floor((seconds % 3600) / 60);
                      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
                    };

                    // Determine gap type for styling
                    const getGapType = (seconds: number) => {
                      if (seconds < 60) return 'minimal'; // Less than 1 minute
                      if (seconds < 900) return 'short'; // Less than 15 minutes
                      return 'long'; // 15+ minutes
                    };

                    // Handle edge cases for gap display
                    const shouldShowGap =
                      gapInSeconds !== null &&
                      gapInSeconds > 30 &&
                      gapInSeconds < 86400; // Only show gaps between 30 seconds and 24 hours
                    const gapType =
                      gapInSeconds && shouldShowGap
                        ? getGapType(gapInSeconds)
                        : null;

                    // Detect overlapping sessions
                    const isOverlapping =
                      gapInSeconds !== null && gapInSeconds < 0;

                    return (
                      <div key={session.id}>
                        {/* Show overlap warning */}
                        {isOverlapping && (
                          <div className="-mt-1 mb-2 flex items-center justify-center">
                            <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700 text-xs ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800">
                              <div className="h-1 w-1 rounded-full bg-amber-500" />
                              <span className="font-medium">
                                Overlapping session
                              </span>
                              <div className="h-1 w-1 rounded-full bg-amber-500" />
                            </div>
                          </div>
                        )}

                        {/* Show gap indicator based on duration */}
                        {shouldShowGap && gapInSeconds && (
                          <div className="-mt-1 mb-2 flex items-center justify-center">
                            {gapType === 'minimal' ? (
                              // Minimal gap - just small dots
                              <div className="flex items-center gap-1">
                                <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                                <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                                <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                              </div>
                            ) : gapType === 'short' ? (
                              // Short break - simple line with time
                              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                <div className="h-px w-6 bg-border" />
                                <span className="rounded bg-muted px-2 py-0.5 text-xs">
                                  {formatGap(gapInSeconds)}
                                </span>
                                <div className="h-px w-6 bg-border" />
                              </div>
                            ) : (
                              // Long break - prominent break indicator
                              <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-muted-foreground text-xs shadow-sm">
                                <div className="h-1 w-8 bg-foreground/10" />
                                <span className="font-medium">
                                  {formatGap(gapInSeconds)} break
                                </span>
                                <div className="h-1 w-8 bg-foreground/10" />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-md border bg-background p-3 text-sm transition-all hover:bg-muted/50 hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full font-medium text-xs',
                                session.is_running
                                  ? 'bg-green-100 text-green-700 ring-2 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800'
                                  : 'bg-primary/10 text-primary'
                              )}
                            >
                              {session.is_running ? (
                                <div className="h-2 w-2 animate-pulse rounded-full bg-green-600" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {sessionStart.format('h:mm A')}
                                  {sessionEnd &&
                                    ` - ${sessionEnd.format('h:mm A')}`}
                                  {session.is_running && (
                                    <span className="text-green-600">
                                      {' '}
                                      - ongoing
                                    </span>
                                  )}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {sessionStart.format('MMM D')}
                                </Badge>
                              </div>
                              {session.description &&
                                session.description !==
                                  stackedSession?.description && (
                                  <p className="mt-1 line-clamp-1 whitespace-pre-wrap text-muted-foreground text-xs">
                                    {getDescriptionText(session.description)}
                                  </p>
                                )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex h-full flex-col items-center justify-center text-right">
                              <span className="font-medium text-sm">
                                {session.duration_seconds &&
                                  formatDuration(session.duration_seconds)}
                              </span>
                              {session.is_running && (
                                <div>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />
                                    Running
                                  </Badge>
                                </div>
                              )}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => onEdit(session)}
                                >
                                  <Edit className="h-3 w-3" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => onMove(session)}
                                >
                                  <Move className="h-3 w-3" />
                                  Move
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => onDelete(session)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Show more/less control for stacked sessions */}
                {hasMoreSessions && (
                  <div className="flex items-center justify-center pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllSessions(!showAllSessions)}
                      className="h-8 text-muted-foreground text-xs hover:text-foreground"
                    >
                      {showAllSessions ? (
                        <>
                          <ChevronUp className="mr-1 h-3 w-3" />
                          Show less ({INITIAL_SESSION_LIMIT} of{' '}
                          {stackedSession?.sessions.length})
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3 w-3" />
                          Show{' '}
                          {stackedSession?.sessions.length -
                            INITIAL_SESSION_LIMIT}{' '}
                          more sessions
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

// Helper function to check if a session is older than one day
const isSessionOlderThanOneDay = (session: SessionWithRelations): boolean => {
  const sessionStartTime = dayjs.utc(session.start_time);
  const oneDayAgo = dayjs().utc().subtract(1, 'day');
  return sessionStartTime.isBefore(oneDayAgo);
};

export function SessionHistory({
  wsId,
  sessions,
  categories,
  tasks,
}: SessionHistoryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterDuration, setFilterDuration] = useState<string>('all');
  const [filterProductivity, setFilterProductivity] = useState<string>('all');
  const [filterTimeOfDay, setFilterTimeOfDay] = useState<string>('all');
  const [filterProjectContext, setFilterProjectContext] =
    useState<string>('all');
  const [filterSessionQuality, setFilterSessionQuality] =
    useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sessionToDelete, setSessionToDelete] =
    useState<SessionWithRelations | null>(null);
  const [sessionToEdit, setSessionToEdit] =
    useState<SessionWithRelations | null>(null);
  const [sessionToMove, setSessionToMove] =
    useState<SessionWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [actionStates, setActionStates] = useState<{ [key: string]: boolean }>(
    {}
  );
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [showMissedEntryDialog, setShowMissedEntryDialog] = useState(false);

  const userTimezone = dayjs.tz.guess();
  const today = dayjs().tz(userTimezone);

  const getTimeOfDayCategory = useCallback(
    (session: SessionWithRelations): string => {
      const hour = dayjs.utc(session.start_time).tz(userTimezone).hour();
      if (hour >= 6 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 18) return 'afternoon';
      if (hour >= 18 && hour < 24) return 'evening';
      return 'night';
    },
    [userTimezone]
  );

  const getProjectContext = useCallback(
    (session: SessionWithRelations): string => {
      if (session.task_id) {
        const task = tasks?.find((t) => t.id === session.task_id);
        return task?.board_name || 'project-work';
      }
      if (session.category?.name?.toLowerCase().includes('meeting'))
        return 'meetings';
      if (session.category?.name?.toLowerCase().includes('learn'))
        return 'learning';
      if (session.category?.name?.toLowerCase().includes('admin'))
        return 'administrative';
      return 'general';
    },
    [tasks]
  );

  const getDurationCategory = useCallback(
    (session: SessionWithRelations): string => {
      const duration = session.duration_seconds || 0;
      if (duration < 1800) return 'short'; // < 30 min
      if (duration < 7200) return 'medium'; // 30 min - 2 hours
      return 'long'; // 2+ hours
    },
    []
  );

  const goToPrevious = () => {
    setCurrentDate(currentDate.subtract(1, viewMode));
  };

  const goToNext = () => {
    setCurrentDate(currentDate.add(1, viewMode));
  };

  const goToToday = () => {
    setCurrentDate(dayjs());
  };

  const formatPeriod = useMemo(() => {
    if (viewMode === 'day') return currentDate.format('MMMM D, YYYY');
    if (viewMode === 'week') {
      const start = currentDate.startOf('isoWeek');
      const end = currentDate.endOf('isoWeek');
      return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
    }
    if (viewMode === 'month') return currentDate.format('MMMM YYYY');
    return '';
  }, [currentDate, viewMode]);

  const isCurrentPeriod = useMemo(() => {
    return today.isSame(currentDate, viewMode);
  }, [currentDate, viewMode, today]);

  const filteredSessions = useMemo(
    () =>
      sessions?.filter((session) => {
        // Search filter
        if (
          searchQuery &&
          !session.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !session.description
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
        ) {
          return false;
        }

        // Category filter
        if (
          filterCategoryId !== 'all' &&
          session.category_id !== filterCategoryId
        )
          return false;

        // Duration filter
        if (
          filterDuration !== 'all' &&
          getDurationCategory(session) !== filterDuration
        )
          return false;

        // Time of day filter
        if (
          filterTimeOfDay !== 'all' &&
          getTimeOfDayCategory(session) !== filterTimeOfDay
        )
          return false;

        // Project context filter
        if (
          filterProjectContext !== 'all' &&
          getProjectContext(session) !== filterProjectContext
        )
          return false;

        return true;
      }),
    [
      sessions,
      searchQuery,
      filterCategoryId,
      filterDuration,
      filterTimeOfDay,
      filterProjectContext,
      getDurationCategory,
      getProjectContext,
      getTimeOfDayCategory,
    ]
  );

  const { startOfPeriod, endOfPeriod } = useMemo(() => {
    const view = viewMode === 'week' ? 'isoWeek' : viewMode;
    const start = currentDate.tz(userTimezone).startOf(view);
    const end = currentDate.tz(userTimezone).endOf(view);
    return { startOfPeriod: start, endOfPeriod: end };
  }, [currentDate, viewMode, userTimezone]);

  const sessionsForPeriod = useMemo(
    () =>
      filteredSessions?.filter((session) => {
        const sessionDate = dayjs.utc(session.start_time).tz(userTimezone);
        return (
          sessionDate.isAfter(startOfPeriod) &&
          sessionDate.isBefore(endOfPeriod)
        );
      }),
    [filteredSessions, startOfPeriod, endOfPeriod, userTimezone]
  );

  const periodStats = useMemo(() => {
    const totalDuration = sessionsForPeriod?.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0
    );
    const categoryDurations: {
      [id: string]: { name: string; duration: number; color: string };
    } = {};

    // Normalize sessions array to avoid undefined lengths producing undefined counts
    const sessionsList = sessionsForPeriod ?? [];

    const timeOfDayBreakdown = {
      morning: sessionsList.filter((s) => getTimeOfDayCategory(s) === 'morning')
        .length,
      afternoon: sessionsList.filter(
        (s) => getTimeOfDayCategory(s) === 'afternoon'
      ).length,
      evening: sessionsList.filter((s) => getTimeOfDayCategory(s) === 'evening')
        .length,
      night: sessionsList.filter((s) => getTimeOfDayCategory(s) === 'night')
        .length,
    };

    const bestTimeOfDay =
      sessionsList.length > 0
        ? Object.entries(timeOfDayBreakdown).reduce<[string, number]>(
            (a, b) => (a[1] > b[1] ? a : b),
            ['morning', 0]
          )[0]
        : 'none';

    const longestSession =
      (sessionsForPeriod?.length || 0) > 0
        ? sessionsForPeriod?.reduce((longest, session) =>
            (session.duration_seconds || 0) > (longest.duration_seconds || 0)
              ? session
              : longest
          )
        : null;

    const shortSessions = sessionsForPeriod?.filter(
      (s) => (s.duration_seconds || 0) < 1800
    ).length;
    const mediumSessions = sessionsForPeriod?.filter(
      (s) =>
        (s.duration_seconds || 0) >= 1800 && (s.duration_seconds || 0) < 7200
    ).length;
    const longSessions = sessionsForPeriod?.filter(
      (s) => (s.duration_seconds || 0) >= 7200
    ).length;

    sessionsForPeriod?.forEach((s) => {
      const id = s.category?.id || 'uncategorized';
      const name = s.category?.name || 'No Category';
      const color = s.category?.color || 'GRAY';

      if (!categoryDurations[id]) {
        categoryDurations[id] = { name, duration: 0, color };
      }
      categoryDurations[id].duration += s.duration_seconds || 0;
    });

    const breakdown = Object.values(categoryDurations)
      .filter((c) => c.duration > 0)
      .sort((a, b) => b.duration - a.duration);

    return {
      totalDuration,
      breakdown,
      timeOfDayBreakdown,
      bestTimeOfDay,
      longestSession,
      shortSessions,
      mediumSessions,
      longSessions,
      sessionCount: sessionsForPeriod?.length,
    };
  }, [sessionsForPeriod, getTimeOfDayCategory]);

  const groupedStackedSessions = useMemo(() => {
    const groups: { [key: string]: StackedSession[] } = {};

    // First, stack the sessions for the period
    const stackedSessions = stackSessions(sessionsForPeriod, viewMode);

    stackedSessions
      .sort((a, b) => dayjs(b.firstStartTime).diff(dayjs(a.firstStartTime)))
      .forEach((stackedSession) => {
        const sessionDate = dayjs
          .utc(stackedSession?.firstStartTime)
          .tz(userTimezone);
        let key = '';

        if (viewMode === 'day') {
          key = 'Sessions';
        } else if (viewMode === 'week') {
          key = sessionDate.format('dddd, MMMM D, YYYY');
        } else if (viewMode === 'month') {
          // For month view, group by week but maintain activity stacking
          const weekStart = sessionDate.startOf('isoWeek');
          const weekEnd = sessionDate.endOf('isoWeek');
          key = `Week ${weekStart.format('MMM D')} - ${weekEnd.format('MMM D')}`;
        }
        if (!groups[key]) groups[key] = [];
        groups[key]?.push(stackedSession);
      });
    return groups;
  }, [sessionsForPeriod, viewMode, userTimezone]);

  const resumeSession = async (session: SessionWithRelations | undefined) => {
    if (!session) return;
    setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: true }));
    try {
      await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
        { method: 'PATCH', body: JSON.stringify({ action: 'resume' }) }
      );

      // Invalidate the running session query to update sidebar
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      router.refresh();
      toast.success(`Started new session: "${session.title}"`);
    } catch (error) {
      console.error('Error resuming session:', error);
      toast.error('Failed to start new session');
    } finally {
      setActionStates((prev) => ({
        ...prev,
        [`resume-${session.id}`]: false,
      }));
    }
  };

  const openEditDialog = (session: SessionWithRelations | undefined) => {
    if (!session) return;
    setSessionToEdit(session);

    const userTz = dayjs.tz.guess();
    const startTimeFormatted = dayjs
      .utc(session.start_time)
      .tz(userTz)
      .format('YYYY-MM-DDTHH:mm');
    const endTimeFormatted = session.end_time
      ? dayjs.utc(session.end_time).tz(userTz).format('YYYY-MM-DDTHH:mm')
      : '';

    const title = session.title;
    const description = session.description || '';
    const categoryId = session.category_id || 'none';
    const taskId = session.task_id || 'none';

    // Set current edit values
    setEditTitle(title);
    setEditDescription(description);
    setEditCategoryId(categoryId);
    setEditTaskId(taskId);
    setEditStartTime(startTimeFormatted);
    setEditEndTime(endTimeFormatted);

    // Store original values for comparison
    setOriginalValues({
      title,
      description,
      categoryId,
      taskId,
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
    });
  };

  const openMoveDialog = (session: SessionWithRelations | undefined) => {
    if (!session) return;
    if (session.is_running) {
      toast.error(
        'Cannot move running sessions. Please stop the session first.'
      );
      return;
    }
    setSessionToMove(session);
  };

  const handleMoveSession = async (targetWorkspaceId: string) => {
    if (!sessionToMove) return;

    setIsMoving(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToMove.id}/move`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetWorkspaceId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to move session');
      }

      const result = await response.json();

      router.refresh();
      setSessionToMove(null);
      toast.success(result.message || 'Session moved successfully');
    } catch (error) {
      console.error('Error moving session:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to move session';
      toast.error(errorMessage);
    } finally {
      setIsMoving(false);
    }
  };

  const closeEditDialog = () => {
    setSessionToEdit(null);
    setOriginalValues(null);
  };

  const saveEdit = async () => {
    if (!sessionToEdit || !originalValues) return;
    setIsEditing(true);
    try {
      const userTz = dayjs.tz.guess();

      // Build only the fields that have changed
      const changes: {
        action: string;
        title?: string;
        description?: string;
        categoryId?: string | null;
        taskId?: string | null;
        startTime?: string;
        endTime?: string;
      } = {
        action: 'edit',
      };

      // Check each field for changes and only include dirty fields
      if (editTitle !== originalValues.title) {
        changes.title = editTitle;
      }

      if (editDescription !== originalValues.description) {
        changes.description = editDescription;
      }

      const currentCategoryId =
        editCategoryId === 'none' ? null : editCategoryId || null;
      const originalCategoryId =
        originalValues.categoryId === 'none'
          ? null
          : originalValues.categoryId || null;
      if (currentCategoryId !== originalCategoryId) {
        changes.categoryId = currentCategoryId;
      }

      const currentTaskId = editTaskId === 'none' ? null : editTaskId || null;
      const originalTaskId =
        originalValues.taskId === 'none' ? null : originalValues.taskId || null;
      if (currentTaskId !== originalTaskId) {
        changes.taskId = currentTaskId;
      }

      if (editStartTime !== originalValues.startTime) {
        changes.startTime = editStartTime
          ? dayjs.tz(editStartTime, userTz).utc().toISOString()
          : undefined;
      }

      if (editEndTime !== originalValues.endTime) {
        changes.endTime = editEndTime
          ? dayjs.tz(editEndTime, userTz).utc().toISOString()
          : undefined;
      }

      // Basic temporal guard: end >= start when both provided
      if (changes.startTime && changes.endTime) {
        if (dayjs(changes.endTime).isBefore(dayjs(changes.startTime))) {
          toast.error('End time cannot be before start time');
          setIsEditing(false);
          return;
        }
      }

      // Only make the request if there are actual changes
      if (Object.keys(changes).length === 1) {
        // Only the 'action' field is present, no actual changes
        closeEditDialog();
        toast.info('No changes detected');
        return;
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToEdit.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changes),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update session');
      }

      router.refresh();
      closeEditDialog();
      toast.success('Session updated successfully');
    } catch (error) {
      console.error('Error updating session:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update session';
      toast.error(errorMessage);
    } finally {
      setIsEditing(false);
    }
  };

  const deleteSession = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToDelete.id}`,
        { method: 'DELETE' }
      );

      // Invalidate the running session query to update sidebar in case an active session was deleted
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      setSessionToDelete(null);
      router.refresh();
      toast.success('Session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };

  const openMissedEntryDialog = () => {
    setShowMissedEntryDialog(true);
  };

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Original values to track changes
  const [originalValues, setOriginalValues] = useState<{
    title: string;
    description: string;
    categoryId: string;
    taskId: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="gap-4 p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                <History className="h-5 w-5 text-dynamic-orange md:h-6 md:w-6" />
              </div>
              <div>
                <div className="font-bold tracking-tight">Session History</div>
                {(sessionsForPeriod?.length || 0) > 0 && (
                  <div className="font-normal text-muted-foreground text-xs md:text-sm">
                    {sessionsForPeriod?.length} session
                    {sessionsForPeriod?.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={openMissedEntryDialog} size="sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Missed Entry</span>
                <span className="sm:hidden">Add Entry</span>
              </Button>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-full pl-10 sm:w-48 md:h-10 md:w-64"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-translate-y-1/2 absolute top-1/2 right-1 h-6 w-6 p-0 hover:bg-transparent"
                      onClick={() => setSearchQuery('')}
                    >
                      ×
                    </Button>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="relative h-9 md:h-10"
                    >
                      <Filter className="h-4 w-4 md:mr-2" />
                      {(filterCategoryId !== 'all' ||
                        filterDuration !== 'all' ||
                        filterProductivity !== 'all' ||
                        filterTimeOfDay !== 'all' ||
                        filterProjectContext !== 'all' ||
                        filterSessionQuality !== 'all') && (
                        <div className="-top-1 -right-1 absolute h-2 w-2 rounded-full bg-dynamic-orange ring-2 ring-background" />
                      )}
                      <span className="hidden md:inline">Filters</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[calc(100vw-2rem)] sm:w-96"
                    align="end"
                    side="bottom"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">
                          Advanced Analytics Filters
                        </h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowAdvancedFilters(!showAdvancedFilters)
                          }
                        >
                          {showAdvancedFilters ? 'Simple' : 'Advanced'}
                        </Button>
                      </div>

                      {/* Basic Filters */}
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <Label className="flex items-center gap-2 font-medium text-sm">
                            <Tag className="h-3 w-3" />
                            Category
                          </Label>
                          <Select
                            value={filterCategoryId}
                            onValueChange={setFilterCategoryId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="All categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                All categories
                              </SelectItem>
                              {categories?.map((category) => (
                                <SelectItem
                                  key={category.id}
                                  value={category.id}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={cn(
                                        'h-3 w-3 rounded-full',
                                        getCategoryColor(
                                          category.color || 'BLUE'
                                        )
                                      )}
                                    />
                                    {category.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="flex items-center gap-2 font-medium text-sm">
                            <Clock className="h-3 w-3" />
                            Duration Type
                          </Label>
                          <Select
                            value={filterDuration}
                            onValueChange={setFilterDuration}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="All durations" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All durations</SelectItem>
                              <SelectItem value="short">
                                🏃 Short (&lt; 30 min)
                              </SelectItem>
                              <SelectItem value="medium">
                                🚶 Medium (30 min - 2h)
                              </SelectItem>
                              <SelectItem value="long">
                                🏔️ Long (2+ hours)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Advanced Filters */}
                      {showAdvancedFilters && (
                        <div className="space-y-3 border-t pt-3">
                          <div>
                            <Label className="flex items-center gap-2 font-medium text-sm">
                              <TrendingUp className="h-3 w-3" />
                              Productivity Type
                            </Label>
                            <Select
                              value={filterProductivity}
                              onValueChange={setFilterProductivity}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All productivity types" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="deep-work">
                                  🧠 Deep Work (80+ focus)
                                </SelectItem>
                                <SelectItem value="focused">
                                  🎯 Focused (60+ focus)
                                </SelectItem>
                                <SelectItem value="standard">
                                  📋 Standard work
                                </SelectItem>
                                <SelectItem value="scattered">
                                  🔀 Scattered (low focus)
                                </SelectItem>
                                <SelectItem value="interrupted">
                                  ⚡ Interrupted (&lt; 15 min)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="flex items-center gap-2 font-medium text-sm">
                              <Sun className="h-3 w-3" />
                              Time of Day
                            </Label>
                            <Select
                              value={filterTimeOfDay}
                              onValueChange={setFilterTimeOfDay}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All times" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All times</SelectItem>
                                <SelectItem value="morning">
                                  🌅 Morning (6 AM - 12 PM)
                                </SelectItem>
                                <SelectItem value="afternoon">
                                  ☀️ Afternoon (12 PM - 6 PM)
                                </SelectItem>
                                <SelectItem value="evening">
                                  🌇 Evening (6 PM - 12 AM)
                                </SelectItem>
                                <SelectItem value="night">
                                  🌙 Night (12 AM - 6 AM)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="flex items-center gap-2 font-medium text-sm">
                              <Briefcase className="h-3 w-3" />
                              Project Context
                            </Label>
                            <Select
                              value={filterProjectContext}
                              onValueChange={setFilterProjectContext}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All contexts" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">
                                  All contexts
                                </SelectItem>
                                <SelectItem value="project-work">
                                  📁 Project Work
                                </SelectItem>
                                <SelectItem value="meetings">
                                  👥 Meetings
                                </SelectItem>
                                <SelectItem value="learning">
                                  📚 Learning
                                </SelectItem>
                                <SelectItem value="administrative">
                                  📋 Administrative
                                </SelectItem>
                                <SelectItem value="general">
                                  🔧 General Tasks
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="flex items-center gap-2 font-medium text-sm">
                              <Star className="h-3 w-3" />
                              Session Quality
                            </Label>
                            <Select
                              value={filterSessionQuality}
                              onValueChange={setFilterSessionQuality}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All qualities" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">
                                  All qualities
                                </SelectItem>
                                <SelectItem value="excellent">
                                  ⭐ Excellent (80+ score)
                                </SelectItem>
                                <SelectItem value="good">
                                  👍 Good (60-79 score)
                                </SelectItem>
                                <SelectItem value="average">
                                  👌 Average (40-59 score)
                                </SelectItem>
                                <SelectItem value="needs-improvement">
                                  📈 Needs Improvement (&lt; 40)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <div className="border-t pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFilterCategoryId('all');
                            setFilterDuration('all');
                            setFilterProductivity('all');
                            setFilterTimeOfDay('all');
                            setFilterProjectContext('all');
                            setFilterSessionQuality('all');
                          }}
                          className="w-full"
                        >
                          🧹 Clear All Filters
                        </Button>
                      </div>

                      {/* Quick Analytics Preview */}
                      {(filteredSessions?.length || 0) > 0 && (
                        <div className="rounded-lg border-t bg-muted/30 p-3">
                          <div className="mb-2 font-medium text-muted-foreground text-xs">
                            📊 Filter Analytics
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="text-center">
                              <div className="font-bold text-primary">
                                {filteredSessions?.length}
                              </div>
                              <div className="text-muted-foreground">
                                Sessions
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t pt-4 md:flex-row md:items-center">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    'h-9 min-w-[70px] flex-1 capitalize transition-all sm:flex-none md:h-10'
                  )}
                >
                  {mode}
                </Button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 md:justify-end">
              <div className="flex w-full items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToPrevious}
                  className="h-9 w-9 shrink-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:h-10 md:w-10"
                  title="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-full min-w-[140px] text-center font-semibold text-sm md:min-w-[180px] md:text-base">
                  {formatPeriod}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNext}
                  className="h-9 w-9 shrink-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:h-10 md:w-10"
                  title="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {!isCurrentPeriod && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  className="h-9 whitespace-nowrap text-xs md:h-10 md:text-sm"
                >
                  {viewMode === 'day'
                    ? 'Today'
                    : `This ${
                        viewMode.charAt(0).toUpperCase() + viewMode.slice(1)
                      }`}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 md:p-6">
          {sessionsForPeriod?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-16">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-orange/10 to-dynamic-orange/5 ring-1 ring-dynamic-orange/20 md:h-24 md:w-24">
                <Clock className="h-10 w-10 text-dynamic-orange md:h-12 md:w-12" />
              </div>
              <h3 className="font-semibold text-foreground text-lg md:text-xl">
                No sessions for this {viewMode}
              </h3>
              <p className="mt-2 max-w-md text-center text-muted-foreground text-sm leading-relaxed md:text-base">
                {sessions?.length === 0
                  ? 'Start tracking time to see your sessions here'
                  : 'Try a different time period or adjusting your filters'}
              </p>
              {sessions?.length === 0 && (
                <Button
                  onClick={openMissedEntryDialog}
                  className="mt-6 bg-dynamic-orange text-white hover:bg-dynamic-orange/90"
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Entry
                </Button>
              )}
            </div>
          ) : viewMode === 'month' ? (
            // Enhanced Month View Layout
            <div className="space-y-6">
              {/* Month Overview Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border bg-linear-to-br from-blue-50 to-blue-100 p-4 dark:from-blue-950/50 dark:to-blue-900/50">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium text-sm">Total Time</span>
                  </div>
                  <p className="mt-1 font-bold text-2xl text-blue-900 dark:text-blue-100">
                    {formatDuration(periodStats?.totalDuration)}
                  </p>
                </div>

                <div className="rounded-lg border bg-linear-to-br from-green-50 to-green-100 p-4 dark:from-green-950/50 dark:to-green-900/50">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <Layers className="h-4 w-4" />
                    <span className="font-medium text-sm">Activities</span>
                  </div>
                  <p className="mt-1 font-bold text-2xl text-green-900 dark:text-green-100">
                    {periodStats?.breakdown.length}
                  </p>
                </div>

                <div className="rounded-lg border bg-linear-to-br from-purple-50 to-purple-100 p-4 dark:from-purple-950/50 dark:to-purple-900/50">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                    <BarChart2 className="h-4 w-4" />
                    <span className="font-medium text-sm">Sessions</span>
                  </div>
                  <p className="mt-1 font-bold text-2xl text-purple-900 dark:text-purple-100">
                    {sessionsForPeriod?.length}
                  </p>
                </div>
              </div>

              {/* Productivity Insights */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                    <BarChart2 className="h-5 w-5" />
                    Top Activities This Month
                  </h3>
                  <div className="space-y-3">
                    {periodStats?.breakdown.slice(0, 5).map((cat, index) => {
                      const percentage =
                        (periodStats?.totalDuration || 0) > 0
                          ? (cat.duration / (periodStats?.totalDuration || 1)) *
                            100
                          : 0;
                      return (
                        <div key={cat.name} className="group">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-medium text-xs">
                                {index + 1}
                              </div>
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'h-3 w-3 rounded-full',
                                    getCategoryColor(cat.color)
                                  )}
                                />
                                <span className="font-medium">{cat.name}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground text-sm">
                                {percentage.toFixed(1)}%
                              </span>
                              <span className="min-w-16 text-right font-semibold">
                                {formatDuration(cat.duration)}
                              </span>
                            </div>
                          </div>
                          <Progress
                            value={percentage}
                            className="h-2"
                            indicatorClassName={getCategoryColor(cat.color)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                    <Brain className="h-5 w-5" />
                    Productivity Insights
                  </h3>
                  <div className="space-y-4">
                    {/* Best Time of Day */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">
                        Most Productive Time
                      </span>
                      <span className="font-medium">
                        {periodStats?.bestTimeOfDay === 'morning' &&
                          '🌅 Morning'}
                        {periodStats?.bestTimeOfDay === 'afternoon' &&
                          '☀️ Afternoon'}
                        {periodStats?.bestTimeOfDay === 'evening' &&
                          '🌇 Evening'}
                        {periodStats?.bestTimeOfDay === 'night' && '🌙 Night'}
                      </span>
                    </div>

                    {/* Session Types Breakdown */}
                    <div className="space-y-2">
                      <div className="text-muted-foreground text-sm">
                        Session Types
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="font-bold text-green-600">
                            {periodStats?.longSessions}
                          </div>
                          <div className="text-muted-foreground">
                            Deep (2h+)
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-blue-600">
                            {periodStats?.mediumSessions}
                          </div>
                          <div className="text-muted-foreground">
                            Focus (30m-2h)
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-orange-600">
                            {periodStats?.shortSessions}
                          </div>
                          <div className="text-muted-foreground">
                            Quick (&lt;30m)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Longest Session Highlight */}
                    {periodStats?.longestSession && (
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="mb-1 text-muted-foreground text-xs">
                          🏆 Longest Session
                        </div>
                        <div className="font-medium text-sm">
                          {periodStats?.longestSession.title}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatDuration(
                            periodStats?.longestSession.duration_seconds || 0
                          )}{' '}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Weekly Breakdown */}
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 font-semibold text-base">
                  <History className="h-5 w-5" />
                  Weekly Breakdown
                </h3>
                {Object.entries(groupedStackedSessions).map(
                  ([groupTitle, groupSessions]) => {
                    const groupTotalDuration = groupSessions.reduce(
                      (sum, session) => sum + session.totalDuration,
                      0
                    );

                    return (
                      <div
                        key={groupTitle}
                        className="rounded-lg border bg-muted/30 p-4"
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="font-medium text-foreground">
                            {groupTitle}
                          </h4>
                          <div className="flex items-center gap-3 text-muted-foreground text-sm">
                            <span>{groupSessions.length} activities</span>
                            <span>•</span>
                            <span className="font-semibold text-foreground">
                              {formatDuration(groupTotalDuration)}
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {groupSessions.map((session) => (
                            <div
                              key={session.id}
                              className="rounded-md border bg-background p-3 transition-all hover:shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h5 className="truncate font-medium text-sm">
                                    {session.title}
                                  </h5>
                                  <div className="mt-1 flex items-center gap-2">
                                    {session.category && (
                                      <div className="flex items-center gap-1">
                                        <div
                                          className={cn(
                                            'h-2 w-2 rounded-full',
                                            getCategoryColor(
                                              session.category.color || 'BLUE'
                                            )
                                          )}
                                        />
                                        <span className="text-muted-foreground text-xs">
                                          {session.category.name}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-semibold text-sm">
                                    {formatDuration(session.totalDuration)}
                                  </div>
                                  {session.sessions.length > 1 && (
                                    <div className="text-muted-foreground text-xs">
                                      {session.sessions.length} sessions
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 flex-1 text-xs"
                                  onClick={() =>
                                    resumeSession(
                                      session.sessions[
                                        session.sessions.length - 1
                                      ]
                                    )
                                  }
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  Resume
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() =>
                                    openEditDialog(
                                      session.sessions[
                                        session.sessions.length - 1
                                      ]
                                    )
                                  }
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() =>
                                    openMoveDialog(
                                      session.sessions[
                                        session.sessions.length - 1
                                      ]
                                    )
                                  }
                                >
                                  <Move className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          ) : (
            // Original Day/Week View Layout
            <>
              <div className="mb-6 rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <BarChart2 className="h-4 w-4" />
                  {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} Summary
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">Total Time</span>
                      <span className="font-bold">
                        {formatDuration(periodStats?.totalDuration)}
                      </span>
                    </div>
                    <Progress value={100} className="h-2" />
                  </div>
                  {periodStats?.breakdown.map((cat) => {
                    const percentage =
                      (periodStats?.totalDuration || 0) > 0
                        ? (cat.duration / (periodStats?.totalDuration || 1)) *
                          100
                        : 0;
                    return (
                      <div key={cat.name}>
                        <div className="mb-1 flex justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'h-2 w-2 rounded-full',
                                getCategoryColor(cat.color)
                              )}
                            />
                            <span>{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="w-10 text-right text-muted-foreground text-xs">
                              {percentage.toFixed(0)}%
                            </span>
                            <span className="font-medium">
                              {formatDuration(cat.duration)}
                            </span>
                          </div>
                        </div>
                        <Progress
                          value={percentage}
                          className="h-2"
                          indicatorClassName={getCategoryColor(cat.color)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-6">
                {Object.entries(groupedStackedSessions).map(
                  ([groupTitle, groupSessions]) => {
                    const groupTotalDuration = groupSessions.reduce(
                      (sum, session) => sum + session.totalDuration,
                      0
                    );

                    return (
                      <div key={groupTitle}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <h3 className="pr-3 font-medium text-muted-foreground text-sm">
                              {groupTitle}
                            </h3>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          {groupSessions.length > 1 && (
                            <div className="ml-3 text-muted-foreground text-xs">
                              {formatDuration(groupTotalDuration)} total
                            </div>
                          )}
                        </div>
                        <div className="mt-4 space-y-3 md:space-y-4">
                          {groupSessions.map((session) => (
                            <StackedSessionItem
                              key={session.id}
                              stackedSession={session}
                              onResume={resumeSession}
                              onEdit={openEditDialog}
                              onDelete={setSessionToDelete}
                              onMove={openMoveDialog}
                              actionStates={actionStates}
                              tasks={tasks}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Session Dialog */}
      <Dialog open={!!sessionToEdit} onOpenChange={() => closeEditDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Session title"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Select
                  value={editCategoryId}
                  onValueChange={setEditCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              getCategoryColor(category.color || 'BLUE')
                            )}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-task">Task</Label>
                <Select value={editTaskId} onValueChange={setEditTaskId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task</SelectItem>
                    {tasks?.map(
                      (task) =>
                        task.id && (
                          <SelectItem key={task.id} value={task.id}>
                            {task.name}
                          </SelectItem>
                        )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sessionToEdit &&
              !sessionToEdit.is_running &&
              (isSessionOlderThanOneDay(sessionToEdit) ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/50">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      Time Editing Restricted
                    </span>
                  </div>
                  <p className="mt-2 text-orange-600 text-sm dark:text-orange-400">
                    Start time and end time cannot be edited for sessions older
                    than one day. This session is from{' '}
                    <span className="font-medium">
                      {dayjs
                        .utc(sessionToEdit.start_time)
                        .tz(dayjs.tz.guess())
                        .format('MMM D, YYYY')}
                    </span>
                    .
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="edit-start-time">Start Time</Label>
                    <Input
                      id="edit-start-time"
                      type="datetime-local"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-end-time">End Time</Label>
                    <Input
                      id="edit-end-time"
                      type="datetime-local"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                    />
                  </div>
                </div>
              ))}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => closeEditDialog()}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={isEditing || !editTitle.trim()}
                className="flex-1"
              >
                {isEditing ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!sessionToDelete}
        onOpenChange={() => setSessionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the session "
              {sessionToDelete?.title}"? This action cannot be undone and will
              permanently remove the tracked time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSession}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Missed Entry Dialog */}
      <MissedEntryDialog
        open={showMissedEntryDialog}
        onOpenChange={setShowMissedEntryDialog}
        categories={categories}
        tasks={tasks}
        wsId={wsId}
      />


      {/* Move Session Dialog */}
      <WorkspaceSelectDialog
        isOpen={!!sessionToMove}
        onClose={() => setSessionToMove(null)}
        onConfirm={handleMoveSession}
        sessionTitle={sessionToMove?.title || ''}
        currentWorkspaceId={wsId}
        isMoving={isMoving}
      />
    </>
  );
}
