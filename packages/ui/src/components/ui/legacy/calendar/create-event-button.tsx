import { Button } from '../../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { PlusIcon } from 'lucide-react';

export const CreateEventButton = () => {
  const { openModal } = useCalendar();

  return (
    <div className="fixed right-6 bottom-6 z-15 flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg"
            onClick={() => openModal()}
          >
            <PlusIcon className="h-6 w-6" />
            <span className="sr-only">Create new event</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Create new event</TooltipContent>
      </Tooltip>
    </div>
  );
};
