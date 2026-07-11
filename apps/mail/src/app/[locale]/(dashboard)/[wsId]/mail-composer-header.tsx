import { Maximize2, Minimize2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function MailComposerHeader({
  closeLabel,
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
}: {
  closeLabel: string;
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
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-dynamic border-b px-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-sm">
          {subject || newMessageLabel}
        </div>
        <div className="text-[0.68rem] text-muted-foreground">{saveLabel}</div>
      </div>
      <Button
        aria-label={minimized ? restoreLabel : minimizeLabel}
        onClick={onMinimize}
        size="icon"
        variant="ghost"
      >
        <Minimize2 className="size-4" />
      </Button>
      <Button
        aria-label={maximizeLabel}
        className="max-md:hidden"
        onClick={onMaximize}
        size="icon"
        variant="ghost"
      >
        <Maximize2 className="size-4" />
      </Button>
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
