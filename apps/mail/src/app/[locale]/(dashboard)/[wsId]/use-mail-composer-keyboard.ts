'use client';

import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react';

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
  const latest = useRef({ open, onSend, onSave, onClose, onAi });
  const actionFrame = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = { open, onSend, onSave, onClose, onAi };
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const root = ref.current;
    let observer: MutationObserver | undefined;
    const frame = requestAnimationFrame(() => {
      const editor = preferBody
        ? root?.querySelector<HTMLElement>('[contenteditable="true"]')
        : null;
      if (preferBody && !editor && root) {
        root.focus();
        observer = new MutationObserver(() => {
          const nextEditor = root.querySelector<HTMLElement>(
            '[contenteditable="true"]'
          );
          if (!nextEditor) return;
          if (document.activeElement === root) nextEditor.focus();
          observer?.disconnect();
        });
        observer.observe(root, { childList: true, subtree: true });
      } else
        (editor ?? root?.querySelector<HTMLElement>('input') ?? root)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (actionFrame.current !== null)
        cancelAnimationFrame(actionFrame.current);
      actionFrame.current = null;
      observer?.disconnect();
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
        ? 'onSend'
        : modifier && key === 's'
          ? 'onSave'
          : modifier && key === 'j'
            ? 'onAi'
            : event.key === 'Escape'
              ? 'onClose'
              : null;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || actionFrame.current !== null) return;
    // Recipient fields commit pending input during bubbling. Use the updated draft after React flushes it.
    actionFrame.current = requestAnimationFrame(() => {
      actionFrame.current = null;
      if (latest.current.open) latest.current[action]();
    });
  };
  return { ref, onKeyDown };
}
