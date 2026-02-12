'use client';

import { CheckCircle, RefreshCw } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { Button } from '../../../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../dialog';
import { Input } from '../../../../input';
import { Label } from '../../../../label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../select';
import { Textarea } from '../../../../textarea';
import { getCategoryColor } from '../utils';

interface TaskBoard {
  id: string;
  name: string;
  task_lists: TaskList[];
}

interface TaskList {
  id: string;
  name: string;
  color: string;
}

interface CreateTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: () => Promise<void>;
  isCreating: boolean;
  taskName: string;
  setTaskName: (name: string) => void;
  taskDescription: string;
  setTaskDescription: (description: string) => void;
  boards: TaskBoard[];
  selectedBoardId: string;
  setSelectedBoardId: (id: string) => void;
  selectedListId: string;
  setSelectedListId: (id: string) => void;
}

export function CreateTaskDialog({
  isOpen,
  onClose,
  onCreate,
  isCreating,
  taskName,
  setTaskName,
  taskDescription,
  setTaskDescription,
  boards,
  selectedBoardId,
  setSelectedBoardId,
  selectedListId,
  setSelectedListId,
}: CreateTaskDialogProps) {
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const availableLists = selectedBoard?.task_lists || [];

  const handleClose = () => {
    onClose();
    setTaskName('');
    setTaskDescription('');
    setSelectedBoardId('');
    setSelectedListId('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Create a new task to track time for. We'll start the timer
            automatically once the task is created.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="task-name">Task Name</Label>
            <Input
              id="task-name"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What are you working on?"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="task-description">Description (Optional)</Label>
            <Textarea
              id="task-description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Add details about this task..."
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="board-select">Board</Label>
            <Select
              value={selectedBoardId}
              onValueChange={(value) => {
                setSelectedBoardId(value);
                setSelectedListId('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a board" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedBoardId && (
            <div>
              <Label htmlFor="list-select">List</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  {availableLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(list.color.toUpperCase())
                          )}
                        />
                        {list.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={onCreate}
              disabled={isCreating || !taskName.trim() || !selectedListId}
              className="flex-1 border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Create & Start Timer
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
