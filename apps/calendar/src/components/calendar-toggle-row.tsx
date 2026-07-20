'use client';

import { Check, Loader2, Lock } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

export function CalendarToggleRow({
  checked,
  color,
  disabled,
  label,
  locked = false,
  onToggle,
}: {
  checked: boolean;
  color: string;
  disabled?: boolean;
  label: string;
  locked?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-transform group-active:scale-90',
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
              'h-2.5 w-2.5 animate-spin',
              checked ? 'text-background' : 'text-muted-foreground'
            )}
          />
        ) : checked ? (
          <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {locked ? (
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
      ) : null}
    </button>
  );
}
