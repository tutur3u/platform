'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { type Ref, useRef } from 'react';

/**
 * Cap a name being typed to the profile limit without trimming, so spaces and
 * IME (Telex/VNI) edits survive each keystroke; trimming happens on blur/join.
 */
function capTypedName(value: string): string {
  if (value.length <= MAX_DISPLAY_NAME_LENGTH) return value;
  let name = '';
  for (const character of value) {
    if (name.length + character.length > MAX_DISPLAY_NAME_LENGTH) break;
    name += character;
  }
  return name;
}

/** The display name field, safe for IME composition. Enter never submits mid-composition. */
export function PrejoinNameField({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  hint,
  disabled,
  maxLength = MAX_DISPLAY_NAME_LENGTH,
  inputRef,
}: {
  id: string;
  label: string;
  /** Leave unset for an uncontrolled field that survives a slow hydration. */
  value?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const composing = useRef(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="name"
        disabled={disabled}
        id={id}
        ref={inputRef}
        maxLength={maxLength}
        onBlur={onBlur}
        onChange={(event) => {
          const { value: next } = event.target;
          // Leave IME composition text untouched until it commits.
          onChange(composing.current ? next : capTypedName(next));
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          onChange(capTypedName(event.currentTarget.value));
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.nativeEvent.isComposing)
            event.preventDefault();
        }}
        placeholder={placeholder}
        value={value}
      />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
