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

interface TaskEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  start: string;
  end: string;
  onNameChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  title: string;
  description: string;
  nameLabel: string;
  startLabel: string;
  endLabel: string;
  cancelLabel: string;
  saveLabel: string;
  savingLabel: string;
  placeholder: string;
}

export function TaskEditDialog({
  open,
  onOpenChange,
  name,
  start,
  end,
  onNameChange,
  onStartChange,
  onEndChange,
  onSave,
  saving,
  title,
  description,
  nameLabel,
  startLabel,
  endLabel,
  cancelLabel,
  saveLabel,
  savingLabel,
  placeholder,
}: TaskEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="font-medium text-xs">{nameLabel}</label>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={placeholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-medium text-xs">{startLabel}</label>
              <Input
                type="date"
                value={start}
                onChange={(event) => onStartChange(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-xs">{endLabel}</label>
              <Input
                type="date"
                value={end}
                onChange={(event) => onEndChange(event.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {cancelLabel}
          </Button>
          <Button onClick={onSave} disabled={saving || !name.trim()}>
            {saving ? savingLabel : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
