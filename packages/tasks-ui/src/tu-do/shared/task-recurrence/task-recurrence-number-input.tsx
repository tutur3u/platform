'use client';

import { Input } from '@tuturuuu/ui/input';
import { type ComponentProps, useState } from 'react';

type InputProps = Omit<
  ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'min' | 'max'
>;

interface TaskRecurrenceNumberInputProps extends InputProps {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
}

const clamp = (raw: string, min: number, max: number) => {
  const parsed = Math.trunc(Number(raw));
  if (raw.trim() === '' || !Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
};

/** A bounded integer field. Typing keeps the raw text so a value can be
 * cleared and retyped; in-range values apply at once and the rest clamp on
 * blur. */
export function TaskRecurrenceNumberInput({
  value,
  min,
  max,
  onValueChange,
  onBlur,
  ...props
}: TaskRecurrenceNumberInputProps) {
  const [text, setText] = useState<string | null>(null);

  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text ?? String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const parsed = Number(raw);
        if (
          raw.trim() !== '' &&
          Number.isInteger(parsed) &&
          parsed >= min &&
          parsed <= max
        )
          onValueChange(parsed);
      }}
      onBlur={(event) => {
        if (text !== null) onValueChange(clamp(text, min, max));
        setText(null);
        onBlur?.(event);
      }}
    />
  );
}
