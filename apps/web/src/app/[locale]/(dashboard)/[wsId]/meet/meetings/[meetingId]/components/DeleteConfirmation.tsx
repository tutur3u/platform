'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface DeleteConfirmationProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  meetingId: string;
  sessionId: string;
  onDeleteSuccess?: () => void;
}

export function DeleteConfirmation({
  isOpen,
  onOpenChange,
  wsId,
  meetingId,
  sessionId,
  onDeleteSuccess,
}: DeleteConfirmationProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }
      toast.success('Recording session deleted');
      onOpenChange(false);
      if (onDeleteSuccess) onDeleteSuccess();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to delete recording session';
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Recording Session?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Are you sure you want to delete this
            recording session?
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
