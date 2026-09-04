'use client';

import { Kbd } from '@tuturuuu/ui/kbd';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

type ShortcutKeyboardEvent = Pick<
  ReactKeyboardEvent<HTMLElement>,
  | 'altKey'
  | 'ctrlKey'
  | 'defaultPrevented'
  | 'isDefaultPrevented'
  | 'key'
  | 'metaKey'
  | 'preventDefault'
  | 'repeat'
  | 'shiftKey'
  | 'stopPropagation'
>;

export function handleTaskOptionShortcut(
  event: ShortcutKeyboardEvent,
  enabled: boolean,
  onSelect: (digit: number) => boolean
) {
  if (
    !enabled ||
    event.defaultPrevented ||
    event.isDefaultPrevented() ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !/^\d$/.test(event.key)
  ) {
    return false;
  }

  const handled = onSelect(Number(event.key));
  if (!handled) return false;

  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function TaskOptionShortcutHint({
  digit,
  visible,
}: {
  digit: number;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <Kbd aria-hidden="true" className="ml-auto min-w-5 justify-center px-1">
      {digit}
    </Kbd>
  );
}
