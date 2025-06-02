'use client';

import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
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
import { useState } from 'react';

interface SessionWithRelations extends TimeTrackingSession {
  category?: TimeTrackingCategory;
  task?: WorkspaceTask;
}

interface SessionHistoryProps {
  wsId: string;
  sessions: SessionWithRelations[];
  categories: TimeTrackingCategory[];
  tasks: Partial<WorkspaceTask>[];
  onSessionUpdate: () => void;
  formatDuration: (seconds: number) => string;
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

export function SessionHistory({
  wsId,
  sessions,
  categories,
  tasks,
  onSessionUpdate,
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

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    if (
      searchQuery &&
      !session.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !session.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    if (filterCategoryId !== 'all' && session.category_id !== filterCategoryId)
      return false;
    if (filterTaskId !== 'all' && session.task_id !== filterTaskId)
      return false;
    return true;
  });

  // Resume session (creates new session with same details)
  const resumeSession = async (session: SessionWithRelations) => {
    setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: true }));

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'resume' }),
        }
      );

      onSessionUpdate();
      toast.success(`Started new session: "${session.title}"`);
    } catch (error) {
      console.error('Error resuming session:', error);
      toast.error('Failed to start new session');
    } finally {
      setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: false }));
    }
  };

  // Open edit dialog
  const openEditDialog = (session: SessionWithRelations) => {
    setSessionToEdit(session);
    setEditTitle(session.title);
    setEditDescription(session.description || '');
    setEditCategoryId(session.category_id || 'none');
    setEditTaskId(session.task_id || 'none');
    setEditStartTime(new Date(session.start_time).toISOString().slice(0, 16));
    setEditEndTime(
      session.end_time
        ? new Date(session.end_time).toISOString().slice(0, 16)
        : ''
    );
  };

  // Save edit
  const saveEdit = async () => {
    if (!sessionToEdit) return;

    setIsEditing(true);

    try {
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
              ? new Date(editStartTime).toISOString()
              : undefined,
            endTime: editEndTime
              ? new Date(editEndTime).toISOString()
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

  // Delete session
  const deleteSession = async () => {
    if (!sessionToDelete) return;

    setIsDeleting(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToDelete.id}`,
        {
          method: 'DELETE',
        }
      );

      setSessionToDelete(null);
      onSessionUpdate();
      toast.success('Time session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Session History
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-10"
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
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="py-12 text-center">
              <Clock className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <p className="text-muted-foreground text-lg">
                {sessions.length === 0
                  ? 'No time sessions yet'
                  : 'No sessions match your filters'}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {sessions.length === 0
                  ? 'Start tracking time to see your sessions here'
                  : 'Try adjusting your search or filters'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className="hover:bg-accent/50 group relative rounded-lg border p-4 transition-all hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-medium">
                        {session.title}
                      </h4>
                      {session.description && (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
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
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(session.start_time).toLocaleDateString()}{' '}
                            at{' '}
                            {new Date(session.start_time).toLocaleTimeString()}
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
                        {session.end_time && (
                          <p className="text-muted-foreground text-xs">
                            Ended at{' '}
                            {new Date(session.end_time).toLocaleTimeString()}
                          </p>
                        )}
                      </div>

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
                            onClick={() => resumeSession(session)}
                            disabled={actionStates[`resume-${session.id}`]}
                          >
                            {actionStates[`resume-${session.id}`] ? (
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-2 h-4 w-4" />
                            )}
                            Start New Session
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openEditDialog(session)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Session
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setSessionToDelete(session)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Session
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
