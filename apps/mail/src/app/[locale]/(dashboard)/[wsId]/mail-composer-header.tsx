import { Maximize2, Minimize2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function MailComposerHeader({
  closeLabel,
  maximized,
  maximizeLabel,
  minimized,
  minimizeLabel,
  newMessageLabel,
  onRequestClose,
  onToggleSize,
  restoreLabel,
  saveLabel,
  subject,
}: {
  closeLabel: string;
  maximized: boolean;
  maximizeLabel: string;
  minimized: boolean;
  minimizeLabel: string;
  newMessageLabel: string;
  onRequestClose: () => void;
  onToggleSize: () => void;
  restoreLabel: string;
  saveLabel: string;
  subject: string;
}) {
  const sizeLabel = minimized || maximized ? restoreLabel : maximizeLabel;
  const SizeIcon = maximized ? Minimize2 : Maximize2;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-dynamic border-b bg-muted/40 px-4">
      <button
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={minimized ? onToggleSize : undefined}
        type="button"
      >
        <span className="block truncate font-semibold text-sm">
          {subject || newMessageLabel}
        </span>
        <span className="block text-[0.68rem] text-muted-foreground">
          {saveLabel}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          aria-label={sizeLabel}
          className="size-8 max-md:hidden"
          onClick={onToggleSize}
          size="icon"
          variant="ghost"
        >
          <SizeIcon className="size-3.5" />
        </Button>
        <Button
          aria-label={minimized ? closeLabel : minimizeLabel}
          className="size-8"
          onClick={onRequestClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}
