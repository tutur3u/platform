import LoadingIndicator from '@/components/common/LoadingIndicator';
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
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void;
  column: { id: string; name: string };
  // eslint-disable-next-line no-unused-vars
  onSave: (columnId: string, name: string) => Promise<void>;
}

export function EditColumnDialog({
  open,
  onOpenChange,
  column,
  onSave,
}: Props) {
  const [name, setName] = useState(column.name);
  const [loading, setLoading] = useState(false);

  // Reset name when dialog opens with a different column
  useEffect(() => {
    setName(column.name);
  }, [column]);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === column.name) {
      onOpenChange(false);
      return;
    }

    try {
      setLoading(true);
      await onSave(column.id, name);
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating column:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Column</DialogTitle>
          <DialogDescription>Change the name of this column</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Column Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter column name"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !name.trim() || name.trim() === column.name}
          >
            {loading ? (
              <>
                <LoadingIndicator className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
