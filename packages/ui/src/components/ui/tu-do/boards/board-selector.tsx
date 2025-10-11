'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ExternalLink } from '@tuturuuu/icons';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@tuturuuu/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useId, useMemo, useState } from 'react';

interface Board {
  id: string;
  name: string;
  task_lists: TaskList[];
}

interface BoardSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  currentBoardId: string;
  taskCount: number;
  onMove: (boardId: string, listId: string) => void;
  isMoving?: boolean;
}

export function BoardSelector({
  open,
  onOpenChange,
  wsId,
  currentBoardId,
  taskCount,
  onMove,
  isMoving = false,
}: BoardSelectorProps) {
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [boardSelectOpen, setBoardSelectOpen] = useState(false);
  const [listSelectOpen, setListSelectOpen] = useState(false);

  // Generate unique IDs for form elements
  const boardSelectId = useId();
  const listSelectId = useId();

  // Fetch boards with their lists
  const { data: boardsData, isLoading } = useQuery<{ boards: Board[] }>({
    queryKey: ['boards-with-lists', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch boards');
      }
      return response.json();
    },
    enabled: open,
  });

  const boards = useMemo(() => {
    return (boardsData?.boards || []).filter(
      (board) => board.id !== currentBoardId
    );
  }, [boardsData?.boards, currentBoardId]);

  const selectedBoard = useMemo(() => {
    return boards.find((board) => board.id === selectedBoardId);
  }, [boards, selectedBoardId]);

  const availableLists = useMemo(() => {
    return selectedBoard?.task_lists || [];
  }, [selectedBoard]);

  const selectedList = useMemo(() => {
    return availableLists.find((list) => list.id === selectedListId);
  }, [availableLists, selectedListId]);

  const handleBoardSelect = useCallback((boardId: string) => {
    setSelectedBoardId(boardId);
    setSelectedListId(''); // Reset list selection when board changes
    setBoardSelectOpen(false);
  }, []);

  const handleListSelect = useCallback((listId: string) => {
    setSelectedListId(listId);
    setListSelectOpen(false);
  }, []);

  const handleMove = useCallback(() => {
    if (selectedBoardId && selectedListId) {
      onMove(selectedBoardId, selectedListId);
    }
  }, [selectedBoardId, selectedListId, onMove]);

  const canMove = selectedBoardId && selectedListId && !isMoving;

  const resetSelections = useCallback(() => {
    setSelectedBoardId('');
    setSelectedListId('');
  }, []);

  // Reset selections when dialog closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetSelections();
      }
      onOpenChange(open);
    },
    [onOpenChange, resetSelections]
  );

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Move {taskCount} task{taskCount !== 1 ? 's' : ''} to another board
            </DialogTitle>
            <DialogDescription>Loading boards...</DialogDescription>
          </DialogHeader>
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-dynamic-blue/20 border-t-dynamic-blue"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Move {taskCount} task{taskCount !== 1 ? 's' : ''} to another board
          </DialogTitle>
          <DialogDescription>
            Select a destination board and list to move your task
            {taskCount !== 1 ? 's' : ''} to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Board Selection */}
          <div className="space-y-2">
            <Label htmlFor={boardSelectId}>Destination Board</Label>
            <Popover open={boardSelectOpen} onOpenChange={setBoardSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={boardSelectOpen}
                  className="w-full justify-between"
                  id={boardSelectId}
                >
                  {selectedBoard ? selectedBoard.name : 'Select a board...'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search boards..." />
                  <CommandList>
                    <CommandEmpty>No boards found.</CommandEmpty>
                    <CommandGroup>
                      <ScrollArea className="h-[200px]">
                        {boards.map((board) => (
                          <CommandItem
                            key={board.id}
                            value={board.name}
                            onSelect={() => handleBoardSelect(board.id)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedBoardId === board.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              <span>{board.name}</span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                              <span>
                                {board.task_lists.length} list
                                {board.task_lists.length !== 1 ? 's' : ''}
                              </span>
                              <ExternalLink className="h-3 w-3" />
                            </div>
                          </CommandItem>
                        ))}
                      </ScrollArea>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* List Selection */}
          <div className="space-y-2">
            <Label htmlFor={listSelectId}>Destination List</Label>
            <Popover open={listSelectOpen} onOpenChange={setListSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={listSelectOpen}
                  className="w-full justify-between"
                  id={listSelectId}
                  disabled={!selectedBoardId}
                >
                  {selectedList
                    ? selectedList.name
                    : selectedBoardId
                      ? 'Select a list...'
                      : 'Select a board first'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search lists..." />
                  <CommandList>
                    <CommandEmpty>
                      {availableLists.length === 0
                        ? 'This board has no lists.'
                        : 'No lists found.'}
                    </CommandEmpty>
                    <CommandGroup>
                      <ScrollArea className="h-[200px]">
                        {availableLists.map((list) => (
                          <CommandItem
                            key={list.id}
                            value={list.name}
                            onSelect={() => handleListSelect(list.id)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedListId === list.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              <span>{list.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  `bg-dynamic-${list.color || 'gray'}`
                                )}
                              />
                              <span className="text-muted-foreground text-xs capitalize">
                                {list.status}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </ScrollArea>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Preview */}
          {selectedBoard && selectedList && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="font-medium text-sm">Move Preview</div>
              <div className="mt-1 text-muted-foreground text-sm">
                Moving {taskCount} task{taskCount !== 1 ? 's' : ''} to{' '}
                <span className="font-medium text-foreground">
                  {selectedList.name}
                </span>{' '}
                in{' '}
                <span className="font-medium text-foreground">
                  {selectedBoard.name}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!canMove}
            className="min-w-[100px]"
          >
            {isMoving ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground"></div>
                Moving...
              </div>
            ) : (
              `Move ${taskCount} task${taskCount !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
