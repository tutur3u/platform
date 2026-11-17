'use client';

import { type KeyboardEvent, useRef } from 'react';

/**
 * cmdk picks the highlighted item on Enter whatever modifiers are held, so a
 * Cmd/Ctrl+Enter meant to save the task would also change the property.
 * Call `handleKeyDownCapture` from the Command's onKeyDownCapture and wrap
 * item handlers in `guard`: the modified press skips the item, runs
 * `onModifierEnter` (closing the picker) and keeps bubbling to the save
 * shortcut.
 */
export function useCommandModifierEnterGuard(onModifierEnter?: () => void) {
  const suppressRef = useRef(false);

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    const isModifierEnter =
      event.key === 'Enter' && (event.metaKey || event.ctrlKey);
    if (!isModifierEnter) return false;

    suppressRef.current = true;
    // cmdk selects synchronously while this press is dispatched.
    queueMicrotask(() => {
      suppressRef.current = false;
    });
    event.preventDefault();
    onModifierEnter?.();
    return true;
  };

  const guard =
    <Args extends unknown[]>(handler: (...args: Args) => void) =>
    (...args: Args) => {
      if (!suppressRef.current) handler(...args);
    };

  return { handleKeyDownCapture, guard };
}
