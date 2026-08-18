'use client';

import { CommandInput } from '@tuturuuu/ui/command';
import type { ComponentProps } from 'react';

interface TaskCommandSearchInputProps
  extends Omit<ComponentProps<typeof CommandInput>, 'value' | 'onValueChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

export function TaskCommandSearchInput({
  value,
  onValueChange,
  onKeyDown,
  ...props
}: TaskCommandSearchInputProps) {
  return (
    <CommandInput
      {...props}
      autoFocus
      value={value}
      onValueChange={onValueChange}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Escape' || !value) return;

        event.preventDefault();
        event.stopPropagation();
        onValueChange('');
      }}
    />
  );
}
