import { Brain, PencilLine, PlusIcon, Sparkles } from '@tuturuuu/icons';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useState } from 'react';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
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
  const [open, setOpen] = useState(false);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const openQuick = () => {
    handleClose();
    openModal(undefined, 'event', { defaultNewEventTab: 'manual' });
  };

  const openAI = () => {
    handleClose();
    openModal(undefined, 'event', { defaultNewEventTab: 'ai' });
  };

  if (variant === 'header') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" className="gap-1.5" onClick={handleOpen}>
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">Create new event</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden">Create new event</TooltipContent>
        <CreateEventDialog
          open={open}
          onOpenChange={setOpen}
          onQuick={openQuick}
          onAI={openAI}
        />
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
            onClick={handleOpen}
          >
            <PlusIcon className="h-6 w-6" />
            <span className="sr-only">Create new event</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Create new event</TooltipContent>
      </Tooltip>
      <CreateEventDialog
        open={open}
        onOpenChange={setOpen}
        onQuick={openQuick}
        onAI={openAI}
      />
    </div>
  );
};

function CreateEventDialog({
  open,
  onOpenChange,
  onQuick,
  onAI,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuick: () => void;
  onAI: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
          <DialogDescription>
            Choose a starting point. You can always fine-tune later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={onQuick}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent/50"
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-dynamic-blue/10 text-dynamic-blue">
              <PencilLine className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">Quick event</div>
              <div className="text-muted-foreground text-xs">
                Fill in title, time, location, and details.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onAI}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent/50"
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-dynamic-purple/10 text-dynamic-purple">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm">AI-assisted</div>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Brain className="h-3 w-3" />
                  Recommended
                </span>
              </div>
              <div className="text-muted-foreground text-xs">
                Describe what you need and get smart time suggestions.
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
