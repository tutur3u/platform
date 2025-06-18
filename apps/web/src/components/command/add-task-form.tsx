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
  const [selectedBoardId, setSelectedBoardId] = useState<string>();
  const [selectedListId, setSelectedListId] = useState<string>();
  const [showTasks, setShowTasks] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get boards with lists
  const { data: boardsData, isLoading: boardsLoading } = useQuery<{
    boards: BoardWithLists[];
  }>({
    queryKey: ['boards-with-lists', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      if (!response.ok) throw new Error('Failed to fetch boards');
      return response.json();
    },
  });

  const boards = boardsData?.boards;

  // Get tasks for selected board/list
  const { data: tasksData, isLoading: tasksLoading } = useQuery<{
    tasks: Task[];
  }>({
    queryKey: ['tasks', wsId, selectedBoardId, selectedListId],
    queryFn: async () => {
      if (!selectedBoardId && !selectedListId) return [];

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
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader className="h-4 w-4 animate-spin text-dynamic-blue" />
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
            createTaskMutation.isPending
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

      {/* Task name validation message */}
      {!inputValue.trim() && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          <span>Enter a task name to continue</span>
        </div>
      )}
    </div>
  );
}
