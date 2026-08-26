'use client';

import { cn } from '@tuturuuu/utils/format';

/** Only the first nine options get a shortcut, matching `optionIndexFromKey`. */
const SHORTCUT_LIMIT = 9;

/**
 * The letter a respondent can press to pick this option.
 *
 * Rendered rather than merely bound, because a shortcut nobody can see is a
 * shortcut nobody uses — the badge is what turns the keyboard handler into a
 * feature. Hidden past the ninth option so it never advertises a key that does
 * nothing.
 *
 * `aria-hidden` on purpose: a screen reader user is already navigating options
 * with arrow keys inside a radio group, and announcing "A" before every label
 * would be noise rather than help.
 */
export function OptionKeyBadge({
  index,
  selected,
}: {
  index: number;
  selected: boolean;
}) {
  if (index >= SHORTCUT_LIMIT) return null;

  return (
    <span
      aria-hidden
      className={cn(
        'hidden h-5 w-5 shrink-0 items-center justify-center rounded border font-medium font-mono text-[10px] uppercase sm:inline-flex',
        selected
          ? 'border-current/30 bg-current/10 opacity-90'
          : 'border-border/60 text-muted-foreground opacity-70'
      )}
    >
      {String.fromCharCode('a'.charCodeAt(0) + index)}
    </span>
  );
}
