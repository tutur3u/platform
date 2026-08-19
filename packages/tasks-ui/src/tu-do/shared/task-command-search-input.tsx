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

const FOCUS_SETTLING_FRAMES = 6;

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
    let remainingFrames = 0;

    const cancelFocusHandoff = () => {
      remainingFrames = 0;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
    };

    const focusUntilSettled = () => {
      cancelFocusHandoff();
      if (submenuContent?.dataset.state === 'closed') return;

      remainingFrames = FOCUS_SETTLING_FRAMES;
      const focusOnFrame = () => {
        frame = undefined;
        if (remainingFrames === 0 || submenuContent?.dataset.state === 'closed')
          return;

        input.focus({ preventScroll: true });
        remainingFrames -= 1;
        if (remainingFrames > 0) {
          frame = window.requestAnimationFrame(focusOnFrame);
        }
      };

      focusOnFrame();
    };

    const stopForPointerInteraction = (event: Event) => {
      if (event.target !== input) cancelFocusHandoff();
    };

    focusUntilSettled();
    submenuContent?.addEventListener(
      'pointerdown',
      stopForPointerInteraction,
      true
    );
    submenuContent?.addEventListener('keydown', cancelFocusHandoff, true);

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
      submenuContent?.removeEventListener(
        'pointerdown',
        stopForPointerInteraction,
        true
      );
      submenuContent?.removeEventListener('keydown', cancelFocusHandoff, true);
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
