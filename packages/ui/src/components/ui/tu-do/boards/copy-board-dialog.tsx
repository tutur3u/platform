'use client';

import { Copy, Loader2 } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { EnhancedTaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';

interface CopyBoardDialogProps {
  board: EnhancedTaskBoard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyBoardDialog({
  board,
  open,
  onOpenChange,
}: CopyBoardDialogProps) {
  const router = useRouter();
  const boardNameId = useId();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [newBoardName, setNewBoardName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingWorkspaces, setIsFetchingWorkspaces] = useState(false);

  // Initialize board name when dialog opens
  useEffect(() => {
    if (open && board) {
      setNewBoardName(`${board.name} (Copy)`);
    }
  }, [open, board]);

  const fetchWorkspaces = useCallback(async () => {
    setIsFetchingWorkspaces(true);
    try {
      const response = await fetch('/api/v1/workspaces');
      if (response.ok) {
        const data = await response.json();
        // Filter out the current workspace
        const availableWorkspaces = data.filter(
          (ws: Workspace) => ws.id !== board.ws_id
        );
        setWorkspaces(availableWorkspaces);
      } else {
        throw new Error('Failed to fetch workspaces');
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch available workspaces',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingWorkspaces(false);
    }
  }, [board.ws_id]);

  // Fetch available workspaces
  useEffect(() => {
    if (open) {
      fetchWorkspaces();
    }
  }, [open, fetchWorkspaces]);

  const handleCopyBoard = async () => {
    if (!selectedWorkspaceId) {
      toast({
        title: 'Error',
        description: 'Please select a workspace',
        variant: 'destructive',
      });
      return;
    }

    if (!newBoardName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a board name',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${board.ws_id}/task-boards/${board.id}/copy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetWorkspaceId: selectedWorkspaceId,
            newBoardName: newBoardName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Board copied successfully',
          description: data.hasStatusConversions
            ? data.message // Use the detailed message from backend
            : `"${data.boardName}" has been copied to the selected workspace`,
          variant: 'default',
        });

        // Reset form and close dialog
        setSelectedWorkspaceId('');
        setNewBoardName('');
        onOpenChange(false);

        // Refresh the current page to show updated boards if still in same workspace
        router.refresh();
      } else {
        throw new Error(data.error || 'Failed to copy board');
      }
    } catch (error) {
      console.error('Error copying board:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to copy board',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedWorkspaceId('');
    setNewBoardName('');
    onOpenChange(false);
  };

  const selectedWorkspace = workspaces.find(
    (ws) => ws.id === selectedWorkspaceId
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy Board
          </DialogTitle>
          <DialogDescription>
            Copy &quot;{board.name}&quot; to another workspace. All columns and
            tasks will be included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Workspace Selection */}
          <div className="space-y-2">
            <Label htmlFor="workspace">Target Workspace</Label>
            {isFetchingWorkspaces ? (
              <div className="flex h-10 items-center justify-center rounded-md border">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-muted-foreground text-sm">
                  Loading workspaces...
                </span>
              </div>
            ) : (
              <Select
                value={selectedWorkspaceId}
                onValueChange={setSelectedWorkspaceId}
                disabled={workspaces.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      workspaces.length === 0
                        ? 'No other workspaces available'
                        : 'Select a workspace'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      <div className="flex items-center space-x-2">
                        {workspace.avatar_url && (
                          <Image
                            src={workspace.avatar_url}
                            alt={workspace.name || ''}
                            width={16}
                            height={16}
                            className="h-4 w-4 rounded"
                          />
                        )}
                        <span>{workspace.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Board Name */}
          <div className="space-y-2">
            <Label htmlFor={boardNameId}>New Board Name</Label>
            <Input
              id={boardNameId}
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Enter board name"
              maxLength={255}
            />
          </div>

          {/* Preview Information */}
          {selectedWorkspace && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Copy to:</span>
                <span className="font-medium">{selectedWorkspace.name}</span>
              </div>
              {board.task_lists && board.task_lists.length > 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Includes:</span>
                  <span className="font-medium">
                    {board.task_lists.length} columns, {board.totalTasks || 0}{' '}
                    tasks
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCopyBoard}
            disabled={
              isLoading ||
              !selectedWorkspaceId ||
              !newBoardName.trim() ||
              workspaces.length === 0
            }
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Copy Board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
