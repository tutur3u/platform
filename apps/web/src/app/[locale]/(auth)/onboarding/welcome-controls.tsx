'use client';

import { cn } from '@tuturuuu/utils/format';

/** An invisible hit area grows a 32px control to the 44px touch target. */
export const HIT_AREA =
  "relative after:absolute after:-inset-1.5 after:content-['']";

export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2';

type Option<T extends string> = { label: string; lang?: string; value: T };

/** A pill group where exactly one option is on, like the sign-in language switch. */
export function SegmentedChoice<T extends string>({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  value: T;
}) {
  return (
    <div
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-full bg-secondary p-0.5"
      role="group"
    >
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={cn(
            HIT_AREA,
            FOCUS_RING,
            'inline-flex h-8 items-center rounded-full px-3 font-bold text-xs transition-colors motion-reduce:transition-none',
            option.value === value
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
          disabled={disabled}
          key={option.value}
          lang={option.lang}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A role=alert line for an inline failure; nothing renders without a message. */
export function InlineAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="rounded-2xl bg-dynamic-red/10 px-3.5 py-3 text-dynamic-red text-sm leading-relaxed"
      role="alert"
    >
      {message}
    </p>
  );
}
