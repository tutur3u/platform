import { PlusIcon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

interface AddEventButtonProps {
  onOpenDialog?: () => void;
}

export default function AddEventButton({ onOpenDialog }: AddEventButtonProps) {
  return (
    <Button
      onClick={onOpenDialog}
      variant="default"
      size="sm"
      className="w-full bg-blue-500 text-white hover:bg-blue-600 md:w-fit"
    >
      <PlusIcon className="mr-2 h-4 w-4" />
      Add Task
    </Button>
  );
}
