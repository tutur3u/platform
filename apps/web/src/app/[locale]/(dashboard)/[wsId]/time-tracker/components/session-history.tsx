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
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  Filter,
  History,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
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
  tasks: Partial<WorkspaceTask>[];
  onSessionUpdate: () => void;
  readOnly?: boolean;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

type ViewMode = 'day' | 'week' | 'month';

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

const SessionItem: FC<{
  session: SessionWithRelations;
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
}> = ({
  session,
  readOnly,
  formatDuration,
  onResume,
  onEdit,
  onDelete,
  actionStates,
}) => {
  const userTimezone = dayjs.tz.guess();
  const startTime = dayjs.utc(session.start_time).tz(userTimezone);
  const endTime = session.end_time
    ? dayjs.utc(session.end_time).tz(userTimezone)
    : null;

  return (
    <div
      key={session.id}
      className="group relative rounded-lg border p-4 transition-all hover:bg-accent/50 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-base font-medium">{session.title}</h4>
          {session.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {session.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {session.category && (
              <Badge
                className={cn(
                  'text-xs',
                  getCategoryColor(session.category.color || 'BLUE')
                )}
              >
                {session.category.name}
              </Badge>
            )}
            {session.task && (
              <Badge variant="outline" className="text-xs">
                {session.task.name}
              </Badge>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {startTime.format('MMM D')} at {startTime.format('h:mm A')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className="text-lg font-medium">
              {session.duration_seconds
                ? formatDuration(session.duration_seconds)
                : '-'}
            </p>
            {endTime && (
              <p className="text-xs text-muted-foreground">
                Ended at {endTime.format('h:mm A')}
              </p>
            )}
          </div>

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
                  onClick={() => onResume(session)}
                  disabled={actionStates[`resume-${session.id}`]}
                >
                  {actionStates[`resume-${session.id}`] ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Start New Session
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(session)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Session
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(session)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Session
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
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

  const groupedSessions = useMemo(() => {
    const groups: { [key: string]: SessionWithRelations[] } = {};

    sessionsForPeriod
      .sort((a, b) => dayjs(b.start_time).diff(dayjs(a.start_time)))
      .forEach((session) => {
        const sessionDate = dayjs.utc(session.start_time).tz(userTimezone);
        let key = '';

        if (viewMode === 'day') {
          key = 'Sessions';
        } else if (viewMode === 'week') {
          key = sessionDate.format('dddd, MMMM D, YYYY');
        } else if (viewMode === 'month') {
          const start = sessionDate.startOf('isoWeek');
          const end = sessionDate.endOf('isoWeek');
          key = `${start.format('MMM D')} - ${end.format('MMM D')}`;
        }
        if (!groups[key]) groups[key] = [];
        groups[key]!.push(session);
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

  return (
    <>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Session History
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 pl-10 md:w-64"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" />
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
                  </div>
                </PopoverContent>
              </Popover>
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
            <div className="py-12 text-center">
              <Clock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">
                No sessions for this {viewMode}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {sessions.length === 0
                  ? 'Start tracking time to see your sessions here'
                  : 'Try a different time period or adjusting your filters'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 rounded-lg border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <BarChart2 className="h-4 w-4" />
                  {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} Summary
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
                {Object.entries(groupedSessions).map(
                  ([groupTitle, groupSessions]) => (
                    <div key={groupTitle}>
                      <div className="flex items-center">
                        <h3 className="pr-2 text-sm font-medium text-muted-foreground">
                          {groupTitle}
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="mt-3 space-y-3">
                        {groupSessions.map((session) => (
                          <SessionItem
                            key={session.id}
                            session={session}
                            readOnly={readOnly}
                            formatDuration={formatDuration}
                            onResume={resumeSession}
                            onEdit={openEditDialog}
                            onDelete={setSessionToDelete}
                            actionStates={actionStates}
                          />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
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
