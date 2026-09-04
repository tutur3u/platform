'use client';

import { useEffect } from 'react';

/**
 * Elements where a keystroke means "type this", not "navigate".
 *
 * A `select` is included because its own keyboard handling owns the arrows,
 * and a `contenteditable` because rich text answers behave like a textarea.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** A textarea is the one field where Enter has to stay a newline. */
function isMultilineTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export interface FormKeyboardOptions {
  enabled: boolean;
  onNext: () => void;
  onPrevious: () => void;
  /**
   * Picks the nth option of the current question, 0-indexed. Returns whether
   * anything was selected, so the handler only swallows the key when it did.
   */
  onSelectOption?: (index: number) => boolean;
}

/**
 * Keyboard navigation for the one-question-at-a-time runtime.
 *
 * | Key | Does |
 * | --- | --- |
 * | `Enter` | Next — except inside a textarea, where it stays a newline |
 * | `Cmd`/`Ctrl` + `Enter` | Next, including from inside a textarea |
 * | `Alt` + `↓` / `Alt` + `↑` | Next / previous, from anywhere |
 * | `1`-`9`, `A`-`I` | Pick that option, when not typing |
 *
 * Bound on `document` rather than a container so it works before the
 * respondent has focused anything — a form that only responds once you click
 * it is not keyboard-navigable, it is keyboard-tolerant.
 *
 * Deliberately not bound: bare arrows and Backspace. Both have meanings inside
 * the fields people are about to use, and stealing them makes text editing feel
 * broken in a way that is hard to attribute.
 */
export function useFormKeyboard({
  enabled,
  onNext,
  onPrevious,
  onSelectOption,
}: FormKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const typing = isTypingTarget(event.target);
      const modified = event.metaKey || event.ctrlKey;

      if (
        event.altKey &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        if (event.key === 'ArrowDown') onNext();
        else onPrevious();
        return;
      }

      if (event.key === 'Enter') {
        // A newline is the only thing Enter can mean in a textarea, so the
        // modifier is the escape hatch there.
        if (isMultilineTarget(event.target) && !modified) return;
        if (event.shiftKey) return;

        event.preventDefault();
        onNext();
        return;
      }

      if (typing || modified || event.altKey) return;

      if (!onSelectOption) return;

      // Typeform's signature: 1-9 and A-I jump straight to an option, so a
      // whole form can be answered without the mouse ever moving.
      const index = optionIndexFromKey(event.key);
      if (index === null) return;

      if (onSelectOption(index)) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onNext, onPrevious, onSelectOption]);
}

/** `1`-`9` and `a`-`i` map to option 0-8. Anything else is not a shortcut. */
export function optionIndexFromKey(key: string): number | null {
  if (key.length !== 1) return null;

  if (key >= '1' && key <= '9') {
    return Number(key) - 1;
  }

  const lower = key.toLowerCase();
  if (lower >= 'a' && lower <= 'i') {
    return lower.charCodeAt(0) - 'a'.charCodeAt(0);
  }

  return null;
}
