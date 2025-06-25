'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertTriangle,
  Check,
  Clock,
  List,
  Loader,
  Plus,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface BoardWithLists {
  id: string;
  name: string;
  task_lists: { id: string; name: string }[];
}

export function AddTaskForm({
  wsId,
  setOpen,
  setIsLoading,
  inputValue,
  setInputValue,
}: {
  wsId: string;
  // eslint-disable-next-line no-unused-vars
  setOpen: (open: boolean) => void;
  // eslint-disable-next-line no-unused-vars
  setIsLoading: (loading: boolean) => void;
  inputValue: string;
  // eslint-disable-next-line no-unused-vars
  setInputValue: (value: string) => void;
}) {
  const router = useRouter();
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [showTasks, setShowTasks] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Early return if no valid workspace ID
  if (!wsId || wsId === 'undefined' || wsId === '00000000-0000-0000-0000-000000000000') {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-dynamic-orange/10 p-3">
          <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
        </div>
        <div>
          <p className="font-semibold text-foreground">No workspace selected</p>
          <p className="text-sm text-muted-foreground">
            Navigate to a workspace to create tasks
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(false);
            window.location.href = '/';
          }}
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  const {
    data: boardsData,
    isLoading: boardsLoading,
    error: boardsError,
    refetch: refetchBoards,
  } = useQuery<{
    boards: BoardWithLists[];
  }>({
    queryKey: ['boards-with-lists', wsId],
    queryFn: async () => {
      console.log('AddTaskForm: Fetching boards for wsId:', wsId);
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      console.log('AddTaskForm: Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.log('AddTaskForm: Error response:', errorText);
        throw new Error('Failed to fetch boards');
      }
      const data = await response.json();
      console.log('AddTaskForm: Success response:', data);
      return data;
    },
    retry: 2,
    retryDelay: 1000,
  });

  const boards = boardsData?.boards;

  // Get tasks for selected board/list
  const {
    data: tasksData,
    isLoading: tasksLoading,
    error: tasksError,
  } = useQuery<{
    tasks: Task[];
  }>({
    queryKey: ['tasks', wsId, selectedBoardId, selectedListId],
    queryFn: async () => {
      if (!selectedBoardId && !selectedListId) return { tasks: [] };

      const params = new URLSearchParams();
      if (selectedListId) params.append('listId', selectedListId);
      else if (selectedBoardId) params.append('boardId', selectedBoardId);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?${params.toString()}`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!(selectedBoardId || selectedListId),
    retry: 2,
    retryDelay: 1000,
  });

  const tasks = tasksData?.tasks;

  const createTaskMutation = useMutation({
    mutationFn: async (data: { name: string; listId: string }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create task');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Task created successfully',
        description: 'Your new task has been added to the board.',
      });
      queryClient.invalidateQueries({
        queryKey: ['tasks', wsId],
      });
      setInputValue('');
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Failed to create task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateTask = () => {
    const taskName = inputValue.trim();

    if (!taskName) {
      toast({
        title: 'Task name is required',
        description: 'Please enter a name for your task.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedListId) {
      toast({
        title: 'List selection required',
        description: 'Please select a board and list for your task.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    createTaskMutation.mutate({
      name: taskName,
      listId: selectedListId,
    });
  };

  const selectedBoard = boards?.find((board) => board.id === selectedBoardId);

  const availableLists = selectedBoard?.task_lists || [];

  const getBoardColor = (boardId: string) => {
    // Since board.color doesn't exist, we'll use a default color mapping based on board ID
    const colors = [
      'bg-dynamic-blue/10 border-dynamic-blue/20 text-dynamic-blue',
      'bg-dynamic-green/10 border-dynamic-green/20 text-dynamic-green',
      'bg-dynamic-purple/10 border-dynamic-purple/20 text-dynamic-purple',
      'bg-dynamic-orange/10 border-dynamic-orange/20 text-dynamic-orange',
      'bg-dynamic-pink/10 border-dynamic-pink/20 text-dynamic-pink',
    ];
    const hash = boardId.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  if (boardsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-3">
          <Loader className="h-5 w-5 animate-spin text-dynamic-blue" />
          <span className="text-sm text-muted-foreground">
            Loading boards...
          </span>
        </div>
      </div>
    );
  }

  if (boardsError) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-dynamic-red/10 p-3">
          <AlertTriangle className="h-6 w-6 text-dynamic-red" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Failed to load boards</p>
          <p className="text-sm text-muted-foreground">
            {boardsError.message || 'Unable to fetch boards at the moment'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchBoards()}
          >
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (!boards || boards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-dynamic-orange/10 p-3">
          <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
        </div>
        <div>
          <p className="font-semibold text-foreground">No boards found</p>
          <p className="text-sm text-muted-foreground">
            Create a board first to add tasks
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.push(`/${wsId}/tasks/boards`);
            setOpen(false);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Board
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Board Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Board</label>
        <Select
          value={selectedBoardId}
          onValueChange={(value) => {
            setSelectedBoardId(value);
            setSelectedListId(undefined);
            setShowTasks(false);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a board..." />
          </SelectTrigger>
          <SelectContent>
            {boards.map((board: any) => (
              <SelectItem key={board.id} value={board.id}>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-3 w-3 flex-shrink-0 rounded-full',
                      getBoardColor(board.id)
                    )}
                  />
                  <span className="truncate">{board.name}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {board.task_lists?.length || 0} lists
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List Selection */}
      {selectedBoardId && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">List</label>
          {availableLists.length === 0 ? (
            <div className="rounded-md border border-dynamic-orange/20 bg-dynamic-orange/5 p-3 text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-dynamic-orange">
                <AlertTriangle className="h-4 w-4" />
                <span>This board has no lists</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a list in the board first to add tasks
              </p>
            </div>
          ) : (
            <Select
              value={selectedListId}
              onValueChange={(value) => {
                setSelectedListId(value);
                setShowTasks(true);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a list..." />
              </SelectTrigger>
              <SelectContent>
                {availableLists.map((list: any) => (
                  <SelectItem key={list.id} value={list.id}>
                    <div className="flex items-center gap-2">
                      <List className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{list.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Current Tasks Preview */}
      {showTasks && selectedListId && (
        <Card className="border-dynamic-gray/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-dynamic-blue" />
              Current Tasks
              {tasksLoading && (
                <Loader className="h-3 w-3 animate-spin text-dynamic-blue" />
              )}
              {tasksError && (
                <AlertTriangle className="h-3 w-3 text-dynamic-red" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin text-dynamic-blue" />
                  <span className="text-xs text-muted-foreground">
                    Loading tasks...
                  </span>
                </div>
              </div>
            ) : tasksError ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <AlertTriangle className="h-4 w-4 text-dynamic-red" />
                <div className="text-xs text-dynamic-red">
                  Failed to load tasks
                </div>
                <div className="text-xs text-muted-foreground">
                  {tasksError.message || 'Unable to fetch tasks'}
                </div>
              </div>
            ) : tasks && tasks.length > 0 ? (
              <ScrollArea className="max-h-32">
                <div className="space-y-2">
                  {tasks.slice(0, 5).map((task: any) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-lg border border-dynamic-gray/10 bg-dynamic-gray/5 p-2"
                    >
                      <div
                        className={cn(
                          'h-2 w-2 flex-shrink-0 rounded-full',
                          task.completed
                            ? 'bg-dynamic-green'
                            : task.priority === 'urgent'
                              ? 'bg-dynamic-red'
                              : 'bg-dynamic-blue'
                        )}
                      />
                      <span
                        className={cn(
                          'flex-1 truncate text-xs',
                          task.completed && 'text-muted-foreground line-through'
                        )}
                      >
                        {task.name}
                      </span>
                      {task.completed && (
                        <Check className="h-3 w-3 text-dynamic-green" />
                      )}
                    </div>
                  ))}
                  {tasks.length > 5 && (
                    <div className="py-1 text-center text-xs text-muted-foreground">
                      +{tasks.length - 5} more tasks
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-4 text-center">
                <div className="text-xs text-muted-foreground">
                  No tasks in this list yet
                </div>
                <div className="mt-1 text-xs text-muted-foreground/70">
                  Perfect time to add the first one!
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Create Task Button */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleCreateTask}
          disabled={
            !inputValue.trim() ||
            !selectedListId ||
            createTaskMutation.isPending ||
            (Boolean(selectedBoardId) && availableLists.length === 0)
          }
          className="w-full"
        >
          {createTaskMutation.isPending ? (
            <div className="flex items-center gap-2">
              <Loader className="h-4 w-4 animate-spin" />
              <span>Creating...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>Create Task</span>
            </div>
          )}
        </Button>
      </div>

      {/* Validation messages */}
      <div className="space-y-1">
        {!inputValue.trim() && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            <span>Enter a task name to continue</span>
          </div>
        )}
        {inputValue.trim() && !selectedBoardId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            <span>Please select a board</span>
          </div>
        )}
        {inputValue.trim() &&
          selectedBoardId &&
          !selectedListId &&
          availableLists.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>Please select a list</span>
            </div>
          )}
        {inputValue.trim() &&
          selectedBoardId &&
          availableLists.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-dynamic-orange">
              <AlertTriangle className="h-3 w-3" />
              <span>The selected board has no lists. Create a list first.</span>
            </div>
          )}
      </div>
    </div>
  );
}
