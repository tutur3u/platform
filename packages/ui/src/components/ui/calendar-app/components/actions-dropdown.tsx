'use client';

import {
  CalendarClock,
  Calendar as CalendarIcon,
  CalendarPlus,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from '@tuturuuu/icons';
import { format } from 'date-fns';
import { useState } from 'react';
import { Button } from '../../button';
import { Calendar } from '../../calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../dropdown-menu';

interface ActionsDropdownProps {
  taskId: string;
  taskName: string;
  startDate?: string | null;
  endDate?: string | null;
  onEdit?: (taskId: string) => void;
  onScheduling?: (taskId: string) => void;
  onStartDateChange?: (taskId: string, date: Date | null) => void;
  onDueDateChange?: (taskId: string, date: Date | null) => void;
  onMarkDone?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}

export default function ActionsDropdown({
  taskId,
  taskName,
  startDate,
  endDate,
  onEdit,
  onScheduling,
  onStartDateChange,
  onDueDateChange,
  onMarkDone,
  onDelete,
}: ActionsDropdownProps) {
  const [startDateDialogOpen, setStartDateDialogOpen] = useState(false);
  const [dueDateDialogOpen, setDueDateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | undefined>(
    startDate ? new Date(startDate) : undefined
  );
  const [selectedDueDate, setSelectedDueDate] = useState<Date | undefined>(
    endDate ? new Date(endDate) : undefined
  );

  const handleStartDateSave = () => {
    onStartDateChange?.(taskId, selectedStartDate || null);
    setStartDateDialogOpen(false);
  };

  const handleDueDateSave = () => {
    onDueDateChange?.(taskId, selectedDueDate || null);
    setDueDateDialogOpen(false);
  };

  const handleDeleteConfirm = () => {
    onDelete?.(taskId);
    setDeleteConfirmOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 transition-colors hover:bg-accent/50"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => onEdit?.(taskId)}
            className="cursor-pointer gap-2"
          >
            <Pencil className="h-4 w-4 text-foreground" />
            Edit task
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => onScheduling?.(taskId)}
            className="cursor-pointer gap-2"
          >
            <CalendarClock className="h-4 w-4 text-dynamic-teal" />
            Configure scheduling
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setStartDateDialogOpen(true)}
            className="cursor-pointer gap-2"
          >
            <CalendarPlus className="h-4 w-4 text-dynamic-blue" />
            {startDate
              ? `Start: ${format(new Date(startDate), 'MMM d')}`
              : 'Set start date'}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setDueDateDialogOpen(true)}
            className="cursor-pointer gap-2"
          >
            <CalendarIcon className="h-4 w-4 text-dynamic-orange" />
            {endDate
              ? `Due: ${format(new Date(endDate), 'MMM d')}`
              : 'Set due date'}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => onMarkDone?.(taskId)}
            className="cursor-pointer gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
            Mark as done
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setDeleteConfirmOpen(true)}
            className="cursor-pointer gap-2 text-dynamic-red focus:text-dynamic-red"
          >
            <Trash2 className="h-4 w-4" />
            Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Start Date Dialog */}
      <Dialog open={startDateDialogOpen} onOpenChange={setStartDateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-dynamic-blue" />
              Set Start Date
            </DialogTitle>
            <DialogDescription>
              Choose when this task should start.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={selectedStartDate}
              onSelect={setSelectedStartDate}
              initialFocus
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {selectedStartDate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStartDate(undefined)}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
            <div className="flex flex-1 justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setStartDateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleStartDateSave}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Due Date Dialog */}
      <Dialog open={dueDateDialogOpen} onOpenChange={setDueDateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-dynamic-orange" />
              Set Due Date
            </DialogTitle>
            <DialogDescription>Choose when this task is due.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={selectedDueDate}
              onSelect={setSelectedDueDate}
              disabled={(date) =>
                selectedStartDate ? date < selectedStartDate : false
              }
              initialFocus
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {selectedDueDate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDueDate(undefined)}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
            <div className="flex flex-1 justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDueDateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleDueDateSave}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to move &quot;{taskName}&quot; to the
              recycle bin?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
