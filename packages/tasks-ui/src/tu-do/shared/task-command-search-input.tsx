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
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
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
