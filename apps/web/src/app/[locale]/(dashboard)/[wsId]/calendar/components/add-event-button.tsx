import { Button } from '@tuturuuu/ui/button';
import { PlusIcon } from '@tuturuuu/ui/icons';

interface AddEventButtonProps {
  onOpenDialog?: () => void;
}

export default function AddEventButton({ onOpenDialog }: AddEventButtonProps) {
  return (
    <Button
      onClick={onOpenDialog}
      variant="default"
      size="sm"
      className="h-8 bg-blue-500 text-white hover:bg-blue-600"
    >
      <PlusIcon className="mr-2 h-4 w-4" />
      Add Task
    </Button>
  );
}
