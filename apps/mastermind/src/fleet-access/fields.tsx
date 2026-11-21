import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { ReactNode } from 'react';

type FieldProps = { id: string; label: string; error?: string };

function Field({
  id,
  label,
  error,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string) =>
  error ? `${id}-error` : undefined;

export function ChoiceField<T extends string>({
  id,
  label,
  error,
  value,
  options,
  onChange,
}: FieldProps & {
  value: T | '';
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function TextField({
  id,
  label,
  error,
  value,
  onChange,
  multiline,
  mono,
}: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  mono?: boolean;
}) {
  const shared = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, error),
    autoComplete: 'off',
    spellCheck: false,
  } as const;
  return (
    <Field id={id} label={label} error={error}>
      {multiline ? (
        <Textarea
          {...shared}
          spellCheck
          maxLength={1000}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          {...shared}
          className={mono ? 'font-mono' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
