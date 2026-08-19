'use client';

import { CommandInput } from '@tuturuuu/ui/command';
import {
  type ComponentProps,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

interface TaskCommandSearchInputProps
  extends Omit<ComponentProps<typeof CommandInput>, 'value' | 'onValueChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

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

  useEffect(() => {
    let frame: number | undefined;
    const input = inputRef.current;
    if (!input) return;

    const submenuContent = input.closest<HTMLElement>('[data-state]');
    const focusInput = () => {
      if (submenuContent?.dataset.state === 'closed') return;

      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
    };

    focusInput();

    let observer: MutationObserver | null = null;
    if (submenuContent) {
      observer = new MutationObserver((mutations) => {
        if (
          mutations.some(
            (mutation) =>
              mutation.type === 'attributes' &&
              mutation.attributeName === 'data-state'
          )
        ) {
          focusInput();
        }
      });
      observer.observe(submenuContent, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
    }

    return () => {
      observer?.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
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
