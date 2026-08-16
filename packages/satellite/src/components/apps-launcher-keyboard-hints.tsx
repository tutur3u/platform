import { ArrowDown, ArrowUp } from '@tuturuuu/icons';

export function AppsLauncherKeyboardHints({
  appsCountLabel,
  navigateLabel,
  selectLabel,
}: {
  appsCountLabel: string;
  navigateLabel: string;
  selectLabel: string;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-muted-foreground text-xs sm:px-4"
      data-slot="apps-launcher-keyboard-hints"
    >
      <span aria-live="polite">{appsCountLabel}</span>
      <div className="hidden items-center gap-3 sm:flex">
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-sans shadow-xs">
            <ArrowUp aria-hidden className="size-3" />
            <ArrowDown aria-hidden className="size-3" />
          </kbd>
          {navigateLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border bg-background px-1.5 font-sans shadow-xs">
            Enter
          </kbd>
          {selectLabel}
        </span>
      </div>
    </div>
  );
}
