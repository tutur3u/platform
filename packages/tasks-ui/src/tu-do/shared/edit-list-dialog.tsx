'use client';

import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  type EditableList,
  ListGeneralForm,
  type ListGeneralSavePayload,
  useListGeneralLabels,
} from './list-general-form';

interface EditListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: EditableList | null;
  allowedStatuses?: TaskBoardStatus[];
  isSaving?: boolean;
  onSave: (payload: ListGeneralSavePayload) => void;
}

export function EditListDialog({
  open,
  onOpenChange,
  list,
  allowedStatuses,
  isSaving = false,
  onSave,
}: EditListDialogProps) {
  const labels = useListGeneralLabels();

  if (!open || !list) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>{labels.editList}</DialogTitle>
          <DialogDescription>{labels.updateListDescription}</DialogDescription>
        </DialogHeader>

        <ListGeneralForm
          key={list.id}
          allowedStatuses={allowedStatuses}
          isSaving={isSaving}
          labels={labels}
          list={list}
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
}
