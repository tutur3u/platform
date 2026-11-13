'use client';

import { Check, Loader2 } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useId } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

/**
 * One calendar's visibility toggle: a coloured checkbox swatch and the name.
 * `hint` (for example "Read-only calendar") shows as a tooltip and is the
 * row's accessible description; it never blocks toggling.
 */
export function CalendarToggleRow({
  checked,
  className,
  color,
  disabled,
  hint,
  label,
  onToggle,
}: {
  checked: boolean;
  className?: string;
  color: string;
  disabled?: boolean;
  hint?: string;
  label: string;
  onToggle: () => void;
}) {
  const hintId = useId();
  const row = (
    <button
      aria-describedby={hint ? hintId : undefined}
      aria-pressed={checked}
      className={cn(
        'group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60',
        className
      )}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-sm border motion-safe:transition-transform motion-safe:group-active:scale-90',
          !checked && 'bg-transparent'
        )}
        style={{
          backgroundColor: checked ? color : undefined,
          borderColor: color,
        }}
      >
        {disabled ? (
          <Loader2
            className={cn(
              'size-2.5 motion-safe:animate-spin',
              checked ? 'text-background' : 'text-muted-foreground'
            )}
          />
        ) : checked ? (
          <Check className="size-2.5 text-background" strokeWidth={3} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
    </button>
  );

  if (!hint) return row;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="right">{hint}</TooltipContent>
      </Tooltip>
      <span hidden id={hintId}>
        {hint}
      </span>
    </>
  );
}
