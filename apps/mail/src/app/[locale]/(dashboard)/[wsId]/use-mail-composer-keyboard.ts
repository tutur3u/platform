'use client';

import { type KeyboardEvent, useEffect, useRef } from 'react';

export function useMailComposerKeyboard({
  open,
  preferBody,
  onSend,
  onSave,
  onClose,
  onAi,
}: {
  open: boolean;
  preferBody: boolean;
  onSend: () => void;
  onSave: () => void;
  onClose: () => void;
  onAi: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      const editor = preferBody
        ? root?.querySelector<HTMLElement>('[contenteditable="true"]')
        : null;
      (editor ?? root?.querySelector<HTMLElement>('input') ?? root)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open, preferBody]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      !event.currentTarget.contains(event.target as Node)
    )
      return;
    const modifier =
      (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
    const key = event.key.toLowerCase();
    const action =
      modifier && key === 'enter'
        ? onSend
        : modifier && key === 's'
          ? onSave
          : modifier && key === 'j'
            ? onAi
            : event.key === 'Escape'
              ? onClose
              : null;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) action();
  };
  return { ref, onKeyDown };
}
