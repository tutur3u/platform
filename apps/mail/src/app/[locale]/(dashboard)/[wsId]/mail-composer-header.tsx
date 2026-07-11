import { Maximize2, Minimize2, MoreHorizontal, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';

export function MailComposerHeader({
  closeLabel,
  maximized,
  maximizeLabel,
  minimized,
  minimizeLabel,
  newMessageLabel,
  onClose,
  onMaximize,
  onMinimize,
  restoreLabel,
  saveLabel,
  subject,
  windowOptionsLabel,
}: {
  closeLabel: string;
  maximized: boolean;
  maximizeLabel: string;
  minimized: boolean;
  minimizeLabel: string;
  newMessageLabel: string;
  onClose: () => void;
  onMaximize: () => void;
  onMinimize: () => void;
  restoreLabel: string;
  saveLabel: string;
  subject: string;
  windowOptionsLabel: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-dynamic border-b px-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-sm">
          {subject || newMessageLabel}
        </div>
        <div className="text-[0.68rem] text-muted-foreground">{saveLabel}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={windowOptionsLabel} size="icon" variant="ghost">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={onMinimize}>
            <Minimize2 className="size-4" />
            {minimized ? restoreLabel : minimizeLabel}
          </DropdownMenuItem>
          <DropdownMenuItem className="max-md:hidden" onClick={onMaximize}>
            <Maximize2 className="size-4" />
            {maximized ? restoreLabel : maximizeLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        aria-label={closeLabel}
        onClick={onClose}
        size="icon"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}
