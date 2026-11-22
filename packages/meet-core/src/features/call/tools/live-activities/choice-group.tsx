'use client';

import { Check } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';

const STEPS: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/**
 * Arrow keys, Home and End for a `radiogroup` built from buttons. Focus moves
 * between the options that can be picked and wraps at the ends. With `select`
 * the option is chosen as focus lands on it, as a native radio group does;
 * without it the person confirms with Space or Enter.
 */
export function radioGroupKeyDown(
  event: KeyboardEvent<HTMLElement>,
  select = false
) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]:not(:disabled)'
    )
  );
  const current = radios.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  const step = STEPS[event.key];
  const target =
    event.key === 'Home'
      ? radios[0]
      : event.key === 'End'
        ? radios.at(-1)
        : step === undefined
          ? undefined
          : radios[(current + step + radios.length) % radios.length];
  if (!target) return;
  event.preventDefault();
  target.focus();
  if (select) target.click();
}

/**
 * The options of one question as a radio group with a single tab stop. The
 * arrow keys only move focus: a pick is sent to the room, and in a game the
 * first one is final, so it takes a deliberate Space, Enter or tap.
 */
export function ChoiceGroup({
  id,
  label,
  options,
  selected,
  correct,
  onSelect,
}: {
  /** The question or round these options belong to. */
  id: string;
  label: string;
  options: readonly string[];
  selected: number | undefined;
  /** Set once the answer is known: marks the right option for everyone. */
  correct?: number;
  /** Absent while the options are read-only. */
  onSelect?: (position: number) => void;
}) {
  const t = useTranslations('meet.call.live_activities.options');
  const tabStop = selected ?? 0;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="space-y-1.5"
      onKeyDown={radioGroupKeyDown}
    >
      {options.map((option, position) => (
        <button
          // Options are identified by position: it is the answer key.
          key={`${id}:${position}`}
          type="button"
          role="radio"
          aria-checked={selected === position}
          tabIndex={position === tabStop ? 0 : -1}
          disabled={!onSelect}
          onClick={() => onSelect?.(position)}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-full border px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            'enabled:hover:bg-accent disabled:cursor-default',
            selected === position && 'border-foreground bg-accent font-semibold',
            correct === position &&
              'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
          )}
        >
          <span className="min-w-0 flex-1 wrap-break-word">{option}</span>
          {/* Said in words and with a mark, never by colour alone. */}
          {correct === position && (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-xs">
              <Check aria-hidden="true" className="size-4" />
              {t('correct_choice')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
