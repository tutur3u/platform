'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Folder,
  LayoutGrid,
  List,
  Loader2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { createTask } from '@tuturuuu/utils/task-helper';
import { useEffect, useRef, useState } from 'react';

interface TaskList {
  id: string;
  name: string;
  status: string;
  color: string | null;
  position: number;
}

interface Board {
  id: string;
  name: string;
  created_at: string;
  task_lists: TaskList[];
}

interface QuickTaskDialogProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function QuickTaskDialog({
  wsId,
  open,
  onOpenChange,
  onSuccess,
}: QuickTaskDialogProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Form state
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [taskName, setTaskName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch boards with lists
  const { data: boardsData, isLoading: isLoadingBoards } = useQuery({
    queryKey: ['boards-with-lists', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/boards`);
      if (!response.ok) {
        throw new Error('Failed to fetch boards');
      }
      return response.json() as Promise<{ boards: Board[] }>;
    },
    enabled: open,
  });

  const boards = boardsData?.boards || [];
  const selectedBoard = boards.find((b) => b.id === selectedBoardId);
  const lists = selectedBoard?.task_lists || [];

  // Auto-select first board and list if only one exists
  useEffect(() => {
    if (open && boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0]!.id);
    }
  }, [open, boards, selectedBoardId]);

  useEffect(() => {
    if (selectedBoardId && lists.length > 0 && !selectedListId) {
      // Select the first "active" list or any list if none are active
      const activeList = lists.find((l) => l.status === 'active') || lists[0];
      if (activeList) {
        setSelectedListId(activeList.id);
      }
    }
  }, [selectedBoardId, lists, selectedListId]);

  // Reset list when board changes - intentionally not including selectedBoardId in deps
  // to avoid circular dependency since this effect sets selectedListId
  const prevBoardRef = useRef(selectedBoardId);
  useEffect(() => {
    if (prevBoardRef.current !== selectedBoardId) {
      setSelectedListId('');
      prevBoardRef.current = selectedBoardId;
    }
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedBoardId('');
      setSelectedListId('');
      setTaskName('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!taskName.trim()) {
      toast.error('Please enter a task name');
      return;
    }
    if (!selectedListId) {
      toast.error('Please select a list');
      return;
    }

    setIsSubmitting(true);
    try {
      await createTask(supabase, selectedListId, {
        name: taskName.trim(),
      });

      toast.success('Task created successfully');
      queryClient.invalidateQueries({ queryKey: ['schedulable-tasks'] });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create task'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = taskName.trim() && selectedListId && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Quick Add Task
          </DialogTitle>
          <DialogDescription>
            Create a new task in your selected board and list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoadingBoards ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : boards.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Folder className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground text-sm">
                No boards found. Create a board first.
              </p>
            </div>
          ) : (
            <>
              {/* Board Selection */}
              <div className="space-y-2">
                <Label
                  htmlFor="board"
                  className="flex items-center gap-1.5 text-sm"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Board
                </Label>
                <Select
                  value={selectedBoardId}
                  onValueChange={setSelectedBoardId}
                >
                  <SelectTrigger id="board">
                    <SelectValue placeholder="Select a board" />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        <div className="flex items-center gap-2">
                          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                          {board.name}
                          <span className="text-muted-foreground text-xs">
                            ({board.task_lists?.length || 0} lists)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* List Selection */}
              {selectedBoardId && (
                <div className="space-y-2">
                  <Label
                    htmlFor="list"
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <List className="h-3.5 w-3.5" />
                    List
                  </Label>
                  {lists.length === 0 ? (
                    <div className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-sm">
                      No lists in this board
                    </div>
                  ) : (
                    <Select
                      value={selectedListId}
                      onValueChange={setSelectedListId}
                    >
                      <SelectTrigger id="list">
                        <SelectValue placeholder="Select a list" />
                      </SelectTrigger>
                      <SelectContent>
                        {lists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-2.5 w-2.5 rounded-full',
                                  list.color
                                    ? `bg-dynamic-${list.color.toLowerCase()}`
                                    : 'bg-muted-foreground'
                                )}
                              />
                              {list.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Task Name Input */}
              {selectedListId && (
                <div className="space-y-2">
                  <Label htmlFor="task-name">Task Name</Label>
                  <Input
                    id="task-name"
                    placeholder="Enter task name..."
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canSubmit) {
                        handleSubmit();
                      }
                    }}
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create Task
                <ChevronRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
