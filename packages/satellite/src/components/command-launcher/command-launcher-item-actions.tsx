'use client';

import { cn } from '@tuturuuu/utils/format';
import type { CommandItemAction } from './use-command-center-navigation';

/**
 * Secondary actions for the highlighted row. Focus stays in the search input;
 * Up/Down move the highlight, Enter runs, Left or Esc returns to results.
 * Beside the list from `sm`, a bottom tray below it.
 */
export function CommandLauncherItemActions({
  actions,
  activeIndex,
  backLabel,
  onRun,
  title,
}: {
  actions: readonly CommandItemAction[];
  activeIndex: number;
  backLabel: string;
  onRun: (action: CommandItemAction) => void;
  title: string;
}) {
  return (
    <aside
      aria-label={title}
      className="absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-y-auto overscroll-contain border-t bg-card p-1.5 shadow-lg sm:static sm:max-h-none sm:border-t-0 sm:border-l sm:shadow-none"
      data-slot="command-item-actions"
    >
      <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1 text-muted-foreground text-xs">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <kbd className="rounded border bg-background px-1 font-mono text-[10px]">
          ←
        </kbd>
        <span className="sr-only">{backLabel}</span>
      </div>
      <div role="listbox" aria-label={title}>
        {actions.map((action, index) => (
          <div
            aria-selected={index === activeIndex}
            className={cn(
              'flex min-h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm',
              index === activeIndex && 'bg-accent text-accent-foreground'
            )}
            id={`command-item-action-${action.id}`}
            key={action.id}
            onClick={() => onRun(action)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRun(action);
            }}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
            tabIndex={-1}
          >
            <span className="text-muted-foreground">{action.icon}</span>
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
