'use client';

import { useQuery } from '@tanstack/react-query';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useMemo, useState } from 'react';
import { CreateListDialog } from '../shared/create-list-dialog';
import { TaskBoardForm } from './form';

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
  currentListId?: string;
  taskCount: number;
  onMove: (boardId: string, listId: string) => void;
  isMoving?: boolean;
}

export function BoardSelector({
  open,
  onOpenChange,
  wsId,
  currentBoardId,
  currentListId,
  taskCount,
  onMove,
  isMoving = false,
}: BoardSelectorProps) {
  const t = useTranslations();
  const tc = useTranslations('common');
  const [selectedBoardId, setSelectedBoardId] =
    useState<string>(currentBoardId);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newBoardDialogOpen, setNewBoardDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState<string>('');
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState<string>('');

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
    return boardsData?.boards || [];
  }, [boardsData?.boards]);

  const selectedBoard = useMemo(() => {
    return boards.find((board) => board.id === selectedBoardId);
  }, [boards, selectedBoardId]);

  const availableLists = useMemo(() => {
    const lists = selectedBoard?.task_lists || [];
    // When moving from a specific list, exclude it from the target options
    if (currentListId && selectedBoardId === currentBoardId) {
      return lists.filter((list) => list.id !== currentListId);
    }
    return lists;
  }, [selectedBoard, currentListId, selectedBoardId, currentBoardId]);

  const selectedList = useMemo(() => {
    return availableLists.find((list) => list.id === selectedListId);
  }, [availableLists, selectedListId]);

  const handleBoardSelect = useCallback((boardId: string) => {
    setSelectedBoardId(boardId);
    setSelectedListId(''); // Reset list selection when board changes
  }, []);

  const handleListSelect = useCallback((listId: string) => {
    setSelectedListId(listId);
  }, []);

  const handleMove = useCallback(() => {
    if (selectedBoardId && selectedListId) {
      onMove(selectedBoardId, selectedListId);
    }
  }, [selectedBoardId, selectedListId, onMove]);

  const canMove = selectedBoardId && selectedListId && !isMoving;

  const resetSelections = useCallback(() => {
    setSelectedBoardId(currentBoardId);
    setSelectedListId('');
  }, [currentBoardId]);

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
        <DialogContent className="sm:max-w-125">
          <DialogHeader>
            <DialogTitle>
              {tc('move_tasks_title', { count: taskCount })}
            </DialogTitle>
            <DialogDescription>{tc('loading_boards')}</DialogDescription>
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
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>
            {tc('move_tasks_title', { count: taskCount })}
          </DialogTitle>
          <DialogDescription>
            {tc('move_tasks_description', { count: taskCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Board Selection */}
          <div className="space-y-2">
            <Label htmlFor={boardSelectId}>{tc('destination_board')}</Label>
            <Combobox
              t={t}
              mode="single"
              options={boards.map((board) => ({
                value: board.id,
                label: board.name,
              }))}
              placeholder={tc('select_or_create_board')}
              selected={selectedBoardId}
              onChange={(value) => handleBoardSelect(value as string)}
              onCreate={(name) => {
                setNewBoardName(name);
                setNewBoardDialogOpen(true);
              }}
              className="w-full"
            />
          </div>

          {/* List Selection */}
          <div className="space-y-2">
            <Label htmlFor={listSelectId}>{tc('destination_list')}</Label>
            <Combobox
              t={t}
              mode="single"
              options={availableLists.map((list) => ({
                value: list.id,
                label: list.name,
              }))}
              placeholder={
                !selectedBoardId
                  ? tc('select_board_first')
                  : tc('select_or_create_list')
              }
              selected={selectedListId}
              onChange={(value) => handleListSelect(value as string)}
              onCreate={
                selectedBoardId
                  ? (name) => {
                      setNewListName(name);
                      setNewListDialogOpen(true);
                    }
                  : undefined
              }
              disabled={!selectedBoardId}
              className="w-full"
            />
          </div>

          {/* Preview */}
          {selectedBoard && selectedList && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="font-medium text-sm">{tc('move_preview')}</div>
              <div className="mt-1 text-muted-foreground text-sm">
                {tc('moving_tasks_to', { count: taskCount })}{' '}
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
            {tc('cancel')}
          </Button>
          <Button onClick={handleMove} disabled={!canMove} className="min-w-25">
            {isMoving ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground"></div>
                {tc('moving')}
              </div>
            ) : (
              tc('move_tasks_count', { count: taskCount })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Board Creation Dialog */}
      <Dialog open={newBoardDialogOpen} onOpenChange={setNewBoardDialogOpen}>
        <DialogContent
          className="p-0"
          style={
            {
              maxWidth: '1200px',
              width: '85vw',
            } as React.CSSProperties
          }
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <TaskBoardForm
            wsId={wsId}
            data={{ name: newBoardName }}
            onFinish={(formData) => {
              setNewBoardDialogOpen(false);
              setNewBoardName('');
              // Auto-select the newly created board
              if (formData?.id) {
                setSelectedBoardId(formData.id);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* List Creation Dialog */}
      {selectedBoardId && (
        <CreateListDialog
          open={newListDialogOpen}
          onOpenChange={setNewListDialogOpen}
          boardId={selectedBoardId}
          wsId={wsId}
          initialName={newListName}
          onSuccess={(listId) => {
            setSelectedListId(listId);
            setNewListName('');
          }}
        />
      )}
    </Dialog>
  );
}
