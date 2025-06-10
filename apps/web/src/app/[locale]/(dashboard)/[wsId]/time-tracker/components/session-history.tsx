'use client';

import type { SessionWithRelations } from '../time-tracker-content';
import type { TimeTrackingCategory, WorkspaceTask } from '@tuturuuu/types/db';
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
import {
  BarChart2,
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
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Trash2,
} from '@tuturuuu/ui/icons';
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
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { type FC, useMemo, useState } from 'react';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

interface SessionHistoryProps {
  wsId: string;
  sessions: SessionWithRelations[];
  categories: TimeTrackingCategory[];
  tasks: (Partial<WorkspaceTask> & {
    board_name?: string;
    list_name?: string;
  })[];
  onSessionUpdate: () => void;
  readOnly?: boolean;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

type ViewMode = 'day' | 'week' | 'month';

// New interface for stacked sessions
interface StackedSession {
  id: string; // Use the first session's ID as the stack ID
  title: string;
  description?: string;
  category: TimeTrackingCategory | null;
  category_id: string | null;
  task: WorkspaceTask | null;
  task_id: string | null;
  sessions: SessionWithRelations[]; // All sessions in this stack
  totalDuration: number; // Sum of all durations
  firstStartTime: string; // Earliest start time
  lastEndTime: string | null; // Latest end time
  isStacked: boolean; // Whether this represents multiple sessions
}

// Utility function to stack sessions by day/month, name, and category
const stackSessions = (
  sessions: SessionWithRelations[],
  viewMode: ViewMode
): StackedSession[] => {
  if (sessions.length === 0) return [];

  const userTimezone = dayjs.tz.guess();

  // Group sessions based on view mode
  const groups: { [key: string]: SessionWithRelations[] } = {};

  sessions.forEach((session) => {
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
    groups[groupKey]!.push(session);
  });

  // Convert groups to stacked sessions
  const stacks: StackedSession[] = [];

  Object.values(groups).forEach((groupSessions) => {
    if (groupSessions.length > 0) {
      // Sort sessions within group by start time
      const sortedSessions = groupSessions.sort((a, b) =>
        dayjs(a.start_time).diff(dayjs(b.start_time))
      );
      stacks.push(createStackedSession(sortedSessions));
    }
  });

  return stacks;
};

// Helper function to create a stacked session object
const createStackedSession = (
  sessions: SessionWithRelations[]
): StackedSession => {
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
  const firstSession = sortedSessions[0]!;
  const lastSession = sortedSessions[sortedSessions.length - 1]!;

  return {
    id: firstSession.id,
    title: firstSession.title,
    description: firstSession.description || undefined,
    category: firstSession.category,
    category_id: firstSession.category_id,
    task: firstSession.task,
    task_id: firstSession.task_id,
    sessions: sortedSessions,
    totalDuration,
    firstStartTime: firstSession.start_time,
    lastEndTime: lastSession.end_time,
    isStacked: sessions.length > 1,
  };
};

const getCategoryColor = (color: string) => {
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

const StackedSessionItem: FC<{
  stackedSession: StackedSession;
  readOnly: boolean;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  onResume: (session: SessionWithRelations) => void;
  // eslint-disable-next-line no-unused-vars
  onEdit: (session: SessionWithRelations) => void;
  // eslint-disable-next-line no-unused-vars
  onDelete: (session: SessionWithRelations) => void;
  actionStates: { [key: string]: boolean };
  tasks: (Partial<WorkspaceTask> & {
    board_name?: string;
    list_name?: string;
  })[];
}> = ({
  stackedSession,
  readOnly,
  formatDuration,
  onResume,
  onEdit,
  onDelete,
  actionStates,
  tasks,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const userTimezone = dayjs.tz.guess();
  const firstStartTime = dayjs
    .utc(stackedSession.firstStartTime)
    .tz(userTimezone);
  const lastEndTime = stackedSession.lastEndTime
    ? dayjs.utc(stackedSession.lastEndTime).tz(userTimezone)
    : null;

  const latestSession =
    stackedSession.sessions[stackedSession.sessions.length - 1]!;

  return (
    <div className="group rounded-lg border transition-all hover:bg-accent/50 hover:shadow-sm">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-base font-semibold">
                {stackedSession.title}
              </h4>
              {stackedSession.isStacked && (
                <Badge variant="secondary" className="text-xs font-medium">
                  <Layers className="mr-1 h-3 w-3" />
                  {stackedSession.sessions.length} sessions
                </Badge>
              )}
            </div>

            {stackedSession.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {stackedSession.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {stackedSession.category && (
                <Badge
                  className={cn(
                    'text-xs font-medium text-white',
                    getCategoryColor(stackedSession.category.color || 'BLUE')
                  )}
                >
                  {stackedSession.category.name}
                </Badge>
              )}
              {stackedSession.task && (
                <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                  <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                  <span className="text-xs font-medium text-dynamic-blue">
                    {stackedSession.task.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-3 w-3 p-0 text-dynamic-blue/60 hover:text-dynamic-blue"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {stackedSession.isStacked &&
                  stackedSession.sessions.length > 1 ? (
                    <>
                      {firstStartTime.format('MMM D')}
                      {lastEndTime &&
                        !firstStartTime.isSame(lastEndTime, 'day') && (
                          <span> - {lastEndTime.format('MMM D')}</span>
                        )}
                      <span className="ml-1">
                        ({stackedSession.sessions.length} sessions)
                      </span>
                      {stackedSession.sessions.some((s) => s.is_running) && (
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
                      ) : stackedSession.sessions.some((s) => s.is_running) ? (
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
            {stackedSession.task &&
              (() => {
                const taskWithDetails = tasks.find(
                  (t) => t.id === stackedSession.task?.id
                );
                return taskWithDetails?.board_name &&
                  taskWithDetails?.list_name ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{taskWithDetails.board_name}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      <span>{taskWithDetails.list_name}</span>
                    </div>
                  </div>
                ) : null;
              })()}
          </div>

          <div className="flex items-start gap-3">
            <div className="text-right">
              <p className="text-xl font-bold text-primary">
                {formatDuration(stackedSession.totalDuration)}
              </p>
              {stackedSession.isStacked && (
                <p className="text-xs font-medium text-muted-foreground">
                  Total time • {stackedSession.sessions.length} sessions
                  {stackedSession.sessions.length > 1 && (
                    <span className="ml-1">
                      across{' '}
                      {
                        new Set(
                          stackedSession.sessions.map((s) =>
                            dayjs
                              .utc(s.start_time)
                              .tz(userTimezone)
                              .format('MMM D')
                          )
                        ).size
                      }{' '}
                      {new Set(
                        stackedSession.sessions.map((s) =>
                          dayjs
                            .utc(s.start_time)
                            .tz(userTimezone)
                            .format('MMM D')
                        )
                      ).size === 1
                        ? 'day'
                        : 'days'}
                    </span>
                  )}
                </p>
              )}
              {lastEndTime && !stackedSession.isStacked && (
                <p className="text-xs text-muted-foreground">
                  Ended at {lastEndTime.format('h:mm A')}
                </p>
              )}
              {stackedSession.sessions.some((s) => s.is_running) && (
                <div className="mt-1">
                  <Badge variant="secondary" className="text-xs">
                    <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    Active session
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {stackedSession.isStacked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 transition-all hover:bg-muted"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={
                    isExpanded
                      ? 'Hide individual sessions'
                      : 'Show individual sessions'
                  }
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              )}

              {!readOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onResume(latestSession)}
                      disabled={actionStates[`resume-${latestSession.id}`]}
                    >
                      {actionStates[`resume-${latestSession.id}`] ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Start New Session
                    </DropdownMenuItem>
                    {!stackedSession.isStacked && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(latestSession)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Session
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(latestSession)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Session
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>

      {stackedSession.isStacked && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent>
            <div className="border-t bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  Individual Sessions ({stackedSession.sessions.length})
                  {stackedSession.sessions.length > 1 && (
                    <span className="ml-1 text-xs">
                      •{' '}
                      {
                        new Set(
                          stackedSession.sessions.map((s) =>
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
                <div className="text-xs text-muted-foreground">
                  {stackedSession.sessions.filter((s) => s.end_time).length}{' '}
                  completed •{' '}
                  {stackedSession.sessions.filter((s) => s.is_running).length}{' '}
                  running
                </div>
              </div>
              <div className="space-y-2">
                {stackedSession.sessions.map((session, index) => {
                  const sessionStart = dayjs
                    .utc(session.start_time)
                    .tz(userTimezone);
                  const sessionEnd = session.end_time
                    ? dayjs.utc(session.end_time).tz(userTimezone)
                    : null;

                  // Calculate gap from previous session
                  const prevSession =
                    index > 0 ? stackedSession.sessions[index - 1] : null;
                  const gapInSeconds =
                    prevSession && prevSession.end_time
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
                          <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 ring-1 ring-amber-200">
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
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className="h-px w-6 bg-border" />
                              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                                {formatGap(gapInSeconds)}
                              </span>
                              <div className="h-px w-6 bg-border" />
                            </div>
                          ) : (
                            // Long break - prominent break indicator
                            <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
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
                              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                              session.is_running
                                ? 'bg-green-100 text-green-700 ring-2 ring-green-200'
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
                                stackedSession.description && (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                  {session.description}
                                </p>
                              )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-sm font-medium">
                              {session.duration_seconds
                                ? formatDuration(session.duration_seconds)
                                : '-'}
                            </span>
                            {session.is_running && (
                              <div className="mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />
                                  Running
                                </Badge>
                              </div>
                            )}
                          </div>
                          {!readOnly && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => onEdit(session)}
                                >
                                  <Edit className="mr-2 h-3 w-3" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => onDelete(session)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-3 w-3" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export function SessionHistory({
  wsId,
  sessions,
  categories,
  tasks,
  onSessionUpdate,
  readOnly = false,
  formatDuration,
  apiCall,
}: SessionHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterTaskId, setFilterTaskId] = useState<string>('all');
  const [sessionToDelete, setSessionToDelete] =
    useState<SessionWithRelations | null>(null);
  const [sessionToEdit, setSessionToEdit] =
    useState<SessionWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [actionStates, setActionStates] = useState<{ [key: string]: boolean }>(
    {}
  );
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(dayjs());

  const userTimezone = dayjs.tz.guess();
  const today = dayjs().tz(userTimezone);

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
      sessions.filter((session) => {
        if (
          searchQuery &&
          !session.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !session.description
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        if (
          filterCategoryId !== 'all' &&
          session.category_id !== filterCategoryId
        )
          return false;
        if (filterTaskId !== 'all' && session.task_id !== filterTaskId)
          return false;
        return true;
      }),
    [sessions, searchQuery, filterCategoryId, filterTaskId]
  );

  const { startOfPeriod, endOfPeriod } = useMemo(() => {
    const view = viewMode === 'week' ? 'isoWeek' : viewMode;
    const start = currentDate.tz(userTimezone).startOf(view);
    const end = currentDate.tz(userTimezone).endOf(view);
    return { startOfPeriod: start, endOfPeriod: end };
  }, [currentDate, viewMode, userTimezone]);

  const sessionsForPeriod = useMemo(
    () =>
      filteredSessions.filter((session) => {
        const sessionDate = dayjs.utc(session.start_time).tz(userTimezone);
        return (
          sessionDate.isAfter(startOfPeriod) &&
          sessionDate.isBefore(endOfPeriod)
        );
      }),
    [filteredSessions, startOfPeriod, endOfPeriod, userTimezone]
  );

  const periodStats = useMemo(() => {
    const totalDuration = sessionsForPeriod.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0
    );
    const categoryDurations: {
      [id: string]: { name: string; duration: number; color: string };
    } = {};

    sessionsForPeriod.forEach((s) => {
      const id = s.category?.id || 'uncategorized';
      const name = s.category?.name || 'No Category';
      const color = s.category?.color || 'GRAY';

      if (!categoryDurations[id]) {
        categoryDurations[id] = { name, duration: 0, color };
      }
      categoryDurations[id]!.duration += s.duration_seconds || 0;
    });

    const breakdown = Object.values(categoryDurations)
      .filter((c) => c.duration > 0)
      .sort((a, b) => b.duration - a.duration);
    return { totalDuration, breakdown };
  }, [sessionsForPeriod]);

  const groupedStackedSessions = useMemo(() => {
    const groups: { [key: string]: StackedSession[] } = {};

    // First, stack the sessions for the period
    const stackedSessions = stackSessions(sessionsForPeriod, viewMode);

    stackedSessions
      .sort((a, b) => dayjs(b.firstStartTime).diff(dayjs(a.firstStartTime)))
      .forEach((stackedSession) => {
        const sessionDate = dayjs
          .utc(stackedSession.firstStartTime)
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
        groups[key]!.push(stackedSession);
      });
    return groups;
  }, [sessionsForPeriod, viewMode, userTimezone]);

  const resumeSession = async (session: SessionWithRelations) => {
    setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: true }));
    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
        { method: 'PATCH', body: JSON.stringify({ action: 'resume' }) }
      );
      onSessionUpdate();
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

  const openEditDialog = (session: SessionWithRelations) => {
    setSessionToEdit(session);
    setEditTitle(session.title);
    setEditDescription(session.description || '');
    setEditCategoryId(session.category_id || 'none');
    setEditTaskId(session.task_id || 'none');
    const userTz = dayjs.tz.guess();
    setEditStartTime(
      dayjs.utc(session.start_time).tz(userTz).format('YYYY-MM-DDTHH:mm')
    );
    setEditEndTime(
      session.end_time
        ? dayjs.utc(session.end_time).tz(userTz).format('YYYY-MM-DDTHH:mm')
        : ''
    );
  };

  const saveEdit = async () => {
    if (!sessionToEdit) return;
    setIsEditing(true);
    try {
      const userTz = dayjs.tz.guess();
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToEdit.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'edit',
            title: editTitle,
            description: editDescription,
            categoryId:
              editCategoryId === 'none' ? null : editCategoryId || null,
            taskId: editTaskId === 'none' ? null : editTaskId || null,
            startTime: editStartTime
              ? dayjs.tz(editStartTime, userTz).utc().toISOString()
              : undefined,
            endTime: editEndTime
              ? dayjs.tz(editEndTime, userTz).utc().toISOString()
              : undefined,
          }),
        }
      );
      setSessionToEdit(null);
      onSessionUpdate();
      toast.success('Session updated successfully');
    } catch (error) {
      console.error('Error updating session:', error);
      toast.error('Failed to update session');
    } finally {
      setIsEditing(false);
    }
  };

  const deleteSession = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToDelete.id}`,
        { method: 'DELETE' }
      );
      setSessionToDelete(null);
      onSessionUpdate();
      toast.success('Session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Export functionality
  const exportToCSV = () => {
    const headers = [
      'Date',
      'Title',
      'Category',
      'Task',
      'Start Time',
      'End Time',
      'Duration (hours)',
      'Description',
    ];

    const csvData = sessionsForPeriod.map((session) => {
      const userTz = dayjs.tz.guess();
      const startTime = dayjs.utc(session.start_time).tz(userTz);
      const endTime = session.end_time
        ? dayjs.utc(session.end_time).tz(userTz)
        : null;

      return [
        startTime.format('YYYY-MM-DD'),
        session.title,
        session.category?.name || '',
        session.task?.name || '',
        startTime.format('HH:mm:ss'),
        endTime?.format('HH:mm:ss') || '',
        session.duration_seconds
          ? (session.duration_seconds / 3600).toFixed(2)
          : '0',
        session.description || '',
      ];
    });

    const csvContent = [headers, ...csvData]
      .map((row) => row.map((field) => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `time-sessions-${currentDate.format('YYYY-MM-DD')}.csv`;
    link.click();

    toast.success('Sessions exported successfully');
  };

  return (
    <>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Session History
              {sessionsForPeriod.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {sessionsForPeriod.length} sessions
                </div>
              )}
            </CardTitle>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-48 pl-10 md:w-64"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 p-0"
                      onClick={() => setSearchQuery('')}
                    >
                      ×
                    </Button>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="mr-2 h-4 w-4" />
                      {(filterCategoryId !== 'all' ||
                        filterTaskId !== 'all') && (
                        <div className="ml-1 h-2 w-2 rounded-full bg-primary" />
                      )}
                      Filter
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Category</Label>
                        <Select
                          value={filterCategoryId}
                          onValueChange={setFilterCategoryId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {categories.map((category) => (
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
                        <Label className="text-sm font-medium">Task</Label>
                        <Select
                          value={filterTaskId}
                          onValueChange={setFilterTaskId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All tasks" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All tasks</SelectItem>
                            {tasks.map((task) => (
                              <SelectItem key={task.id} value={task.id!}>
                                {task.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFilterCategoryId('all');
                            setFilterTaskId('all');
                          }}
                          className="w-full"
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {sessionsForPeriod.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportToCSV}>
                    Export CSV
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t pt-4 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                  className="capitalize"
                >
                  {mode}
                </Button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 md:justify-end">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToPrevious}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[180px] text-center text-sm font-medium">
                  {formatPeriod}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNext}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {!isCurrentPeriod && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  className="text-xs"
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

        <CardContent>
          {sessionsForPeriod.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                <Clock className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-muted-foreground">
                No sessions for this {viewMode}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {sessions.length === 0
                  ? 'Start tracking time to see your sessions here'
                  : 'Try a different time period or adjusting your filters'}
              </p>
            </div>
          ) : (
            <>
              {viewMode === 'month' ? (
                // Enhanced Month View Layout
                <div className="space-y-6">
                  {/* Month Overview Cards */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100 p-4 dark:from-blue-950/50 dark:to-blue-900/50">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-medium">Total Time</span>
                      </div>
                      <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {formatDuration(periodStats.totalDuration)}
                      </p>
                    </div>

                    <div className="rounded-lg border bg-gradient-to-br from-green-50 to-green-100 p-4 dark:from-green-950/50 dark:to-green-900/50">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                        <Layers className="h-4 w-4" />
                        <span className="text-sm font-medium">Activities</span>
                      </div>
                      <p className="mt-1 text-2xl font-bold text-green-900 dark:text-green-100">
                        {periodStats.breakdown.length}
                      </p>
                    </div>

                    <div className="rounded-lg border bg-gradient-to-br from-purple-50 to-purple-100 p-4 dark:from-purple-950/50 dark:to-purple-900/50">
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                        <BarChart2 className="h-4 w-4" />
                        <span className="text-sm font-medium">Sessions</span>
                      </div>
                      <p className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
                        {sessionsForPeriod.length}
                      </p>
                    </div>
                  </div>

                  {/* Productivity Insights */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
                        <BarChart2 className="h-5 w-5" />
                        Top Activities This Month
                      </h3>
                      <div className="space-y-3">
                        {periodStats.breakdown.slice(0, 5).map((cat, index) => {
                          const percentage =
                            periodStats.totalDuration > 0
                              ? (cat.duration / periodStats.totalDuration) * 100
                              : 0;
                          return (
                            <div key={cat.name} className="group">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                    {index + 1}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={cn(
                                        'h-3 w-3 rounded-full',
                                        getCategoryColor(cat.color)
                                      )}
                                    />
                                    <span className="font-medium">
                                      {cat.name}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-muted-foreground">
                                    {percentage.toFixed(1)}%
                                  </span>
                                  <span className="min-w-[4rem] text-right font-semibold">
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
                      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
                        <Clock className="h-5 w-5" />
                        Productivity Insights
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Daily Average
                          </span>
                          <span className="font-medium">
                            {formatDuration(
                              Math.floor(
                                periodStats.totalDuration /
                                  Math.max(
                                    1,
                                    new Set(
                                      sessionsForPeriod.map((s) =>
                                        dayjs
                                          .utc(s.start_time)
                                          .tz(userTimezone)
                                          .format('YYYY-MM-DD')
                                      )
                                    ).size
                                  )
                              )
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Active Days
                          </span>
                          <span className="font-medium">
                            {
                              new Set(
                                sessionsForPeriod.map((s) =>
                                  dayjs
                                    .utc(s.start_time)
                                    .tz(userTimezone)
                                    .format('YYYY-MM-DD')
                                )
                              ).size
                            }{' '}
                            days
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Avg Session Length
                          </span>
                          <span className="font-medium">
                            {formatDuration(
                              Math.floor(
                                periodStats.totalDuration /
                                  Math.max(1, sessionsForPeriod.length)
                              )
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Most Productive Day
                          </span>
                          <span className="font-medium">
                            {(() => {
                              const dailyTotals = sessionsForPeriod.reduce(
                                (acc, session) => {
                                  const day = dayjs
                                    .utc(session.start_time)
                                    .tz(userTimezone)
                                    .format('dddd');
                                  acc[day] =
                                    (acc[day] || 0) +
                                    (session.duration_seconds || 0);
                                  return acc;
                                },
                                {} as Record<string, number>
                              );
                              const topDay = Object.entries(dailyTotals).sort(
                                ([, a], [, b]) => b - a
                              )[0];
                              return topDay ? topDay[0] : 'N/A';
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Weekly Breakdown */}
                  <div className="space-y-4">
                    <h3 className="flex items-center gap-2 text-base font-semibold">
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
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
                                      <h5 className="truncate text-sm font-medium">
                                        {session.title}
                                      </h5>
                                      <div className="mt-1 flex items-center gap-2">
                                        {session.category && (
                                          <div className="flex items-center gap-1">
                                            <div
                                              className={cn(
                                                'h-2 w-2 rounded-full',
                                                getCategoryColor(
                                                  session.category.color ||
                                                    'BLUE'
                                                )
                                              )}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                              {session.category.name}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-sm font-semibold">
                                        {formatDuration(session.totalDuration)}
                                      </div>
                                      {session.isStacked && (
                                        <div className="text-xs text-muted-foreground">
                                          {session.sessions.length} sessions
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {!readOnly && (
                                    <div className="mt-3 flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 flex-1 text-xs"
                                        onClick={() =>
                                          resumeSession(
                                            session.sessions[
                                              session.sessions.length - 1
                                            ]!
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
                                            ]!
                                          )
                                        }
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
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
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <BarChart2 className="h-4 w-4" />
                      {viewMode.charAt(0).toUpperCase() +
                        viewMode.slice(1)}{' '}
                      Summary
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium">Total Time</span>
                          <span className="font-bold">
                            {formatDuration(periodStats.totalDuration)}
                          </span>
                        </div>
                        <Progress value={100} className="h-2" />
                      </div>
                      {periodStats.breakdown.map((cat) => {
                        const percentage =
                          periodStats.totalDuration > 0
                            ? (cat.duration / periodStats.totalDuration) * 100
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
                                <span className="w-10 text-right text-xs text-muted-foreground">
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
                                <h3 className="pr-3 text-sm font-medium text-muted-foreground">
                                  {groupTitle}
                                </h3>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                              {groupSessions.length > 1 && (
                                <div className="ml-3 text-xs text-muted-foreground">
                                  {formatDuration(groupTotalDuration)} total
                                </div>
                              )}
                            </div>
                            <div className="mt-3 space-y-3">
                              {groupSessions.map((session) => (
                                <StackedSessionItem
                                  key={session.id}
                                  stackedSession={session}
                                  readOnly={readOnly}
                                  formatDuration={formatDuration}
                                  onResume={resumeSession}
                                  onEdit={openEditDialog}
                                  onDelete={setSessionToDelete}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Session Dialog */}
      <Dialog
        open={!!sessionToEdit}
        onOpenChange={() => setSessionToEdit(null)}
      >
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
                    {categories.map((category) => (
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
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id!}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sessionToEdit && !sessionToEdit.is_running && (
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
            )}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setSessionToEdit(null)}
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
    </>
  );
}
