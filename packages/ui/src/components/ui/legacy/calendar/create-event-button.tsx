import { PlusIcon } from '@tuturuuu/icons';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { Button } from '../../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

type CreateEventButtonProps = {
  /**
   * Variant of the button:
   * - 'floating': Fixed position at bottom-right (default, legacy behavior)
   * - 'header': Inline button suitable for header placement
   */
  variant?: 'floating' | 'header';
  /** Label text for header variant */
  label?: string;
};

export const CreateEventButton = ({
  variant = 'floating',
  label = 'New event',
}: CreateEventButtonProps) => {
  const { openModal } = useCalendar();

  if (variant === 'header') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" className="gap-1.5" onClick={() => openModal()}>
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">Create new event</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden">Create new event</TooltipContent>
      </Tooltip>
    );
  }

  // Floating variant (legacy)
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
