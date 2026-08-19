'use client';

import { CommandInput } from '@tuturuuu/ui/command';
import {
  type ComponentProps,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';

interface TaskCommandSearchInputProps
  extends Omit<ComponentProps<typeof CommandInput>, 'value' | 'onValueChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

const FOCUS_SETTLING_MS = 500;

export function clearTaskCommandSearchOnEscape(
  event: { preventDefault: () => void },
  value: string,
  onValueChange: (value: string) => void
) {
  if (!value) return false;

  event.preventDefault();
  onValueChange('');
  return true;
}

export function TaskCommandSearchInput({
  value,
  onValueChange,
  onKeyDownCapture,
  ref,
  ...props
}: TaskCommandSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const submenuContent = input.closest<HTMLElement>('[data-state]');
    let frame: number | undefined;
    let settlingTimer: number | undefined;
    let isSettling = false;

    const cancelFocusHandoff = () => {
      isSettling = false;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (settlingTimer !== undefined) window.clearTimeout(settlingTimer);
      frame = undefined;
      settlingTimer = undefined;
    };

    const scheduleFocus = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        if (!isSettling || submenuContent?.dataset.state === 'closed') return;

        input.focus({ preventScroll: true });
      });
    };

    const focusUntilSettled = () => {
      cancelFocusHandoff();
      if (submenuContent?.dataset.state === 'closed') return;

      isSettling = true;
      input.focus({ preventScroll: true });
      settlingTimer = window.setTimeout(cancelFocusHandoff, FOCUS_SETTLING_MS);
    };

    const reclaimLateFocusHandoff = (event: FocusEvent) => {
      if (!isSettling || event.target === input) return;

      const nextSubmenu =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              '[data-slot="dropdown-menu-sub-content"]'
            )
          : null;
      if (nextSubmenu && nextSubmenu !== submenuContent) {
        cancelFocusHandoff();
        return;
      }

      scheduleFocus();
    };

    const stopForPointerInteraction = (event: PointerEvent) => {
      if (event.target !== input) cancelFocusHandoff();
    };

    focusUntilSettled();
    document.addEventListener('focusin', reclaimLateFocusHandoff, true);
    document.addEventListener('pointerdown', stopForPointerInteraction, true);
    document.addEventListener('keydown', cancelFocusHandoff, true);

    const observer = submenuContent
      ? new MutationObserver((mutations) => {
          if (
            mutations.some(
              (mutation) =>
                mutation.type === 'attributes' &&
                mutation.attributeName === 'data-state'
            )
          ) {
            focusUntilSettled();
          }
        })
      : null;
    observer?.observe(submenuContent as HTMLElement, {
      attributes: true,
      attributeFilter: ['data-state'],
    });

    return () => {
      observer?.disconnect();
      document.removeEventListener('focusin', reclaimLateFocusHandoff, true);
      document.removeEventListener(
        'pointerdown',
        stopForPointerInteraction,
        true
      );
      document.removeEventListener('keydown', cancelFocusHandoff, true);
      cancelFocusHandoff();
    };
  }, []);

  return (
    <CommandInput
      {...props}
      autoFocus
      ref={inputRef}
      value={value}
      onValueChange={onValueChange}
      onKeyDownCapture={(event) => {
        onKeyDownCapture?.(event);
        if (
          event.defaultPrevented ||
          event.key !== 'Escape' ||
          !clearTaskCommandSearchOnEscape(event, value, onValueChange)
        )
          return;

        event.stopPropagation();
      }}
    />
  );
}
