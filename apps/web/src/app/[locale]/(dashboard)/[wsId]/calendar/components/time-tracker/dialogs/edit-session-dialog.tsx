'use client';

import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from '@tuturuuu/ui/textarea';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '../../../../time-tracker/types';

interface EditSessionDialogProps {
  session: SessionWithRelations | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  isEditing: boolean;
  editData: {
    title: string;
    description: string;
    categoryId: string;
    taskId: string;
    startTime: string;
    endTime: string;
  };
  onEditDataChange: (data: {
    title: string;
    description: string;
    categoryId: string;
    taskId: string;
    startTime: string;
    endTime: string;
  }) => void;
  categories: TimeTrackingCategory[];
  tasks: ExtendedWorkspaceTask[];
}

export function EditSessionDialog({
  session,
  onClose,
  onSave,
  isEditing,
  editData,
  onEditDataChange,
  categories,
  tasks,
}: EditSessionDialogProps) {
  const updateField = (field: keyof typeof editData, value: string) => {
    onEditDataChange({ ...editData, [field]: value });
  };

  return (
    <Dialog open={!!session} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
          <DialogDescription>
            Modify the details of this time tracking session
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={editData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Session title"
            />
          </div>
          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={editData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={editData.categoryId}
                onValueChange={(v) => updateField('categoryId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-task">Task</Label>
              <Select
                value={editData.taskId}
                onValueChange={(v) => updateField('taskId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No task</SelectItem>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id || ''}>
                      {task.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {session && !session.is_running && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-start-time">Start Time</Label>
                <Input
                  id="edit-start-time"
                  type="datetime-local"
                  value={editData.startTime}
                  onChange={(e) => updateField('startTime', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-end-time">End Time</Label>
                <Input
                  id="edit-end-time"
                  type="datetime-local"
                  value={editData.endTime}
                  onChange={(e) => updateField('endTime', e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={isEditing || !editData.title.trim()}
              className="flex-1"
            >
              {isEditing ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
