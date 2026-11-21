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

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  /** A persistent hint below the control. */
  note?: string;
  /** Invalid without its own message, e.g. one of a pair that failed together. */
  invalid?: boolean;
  /** Another element's message that explains this control too. */
  describedBy?: string;
};

function Field({
  id,
  label,
  error,
  note,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {note && (
        <p id={`${id}-note`} className="text-muted-foreground text-sm">
          {note}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function ariaOf({ id, error, note, invalid, describedBy }: FieldProps) {
  const ids = [
    note && `${id}-note`,
    error && `${id}-error`,
    describedBy,
  ].filter(Boolean);
  return {
    'aria-invalid': error || invalid ? true : undefined,
    'aria-describedby': ids.length ? ids.join(' ') : undefined,
  } as const;
}

export function ChoiceField<T extends string>({
  value,
  options,
  onChange,
  ...field
}: FieldProps & {
  value: T | '';
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field {...field}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={field.id} className="w-full" {...ariaOf(field)}>
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
  value,
  onChange,
  multiline,
  mono,
  ...field
}: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  mono?: boolean;
}) {
  const shared = {
    id: field.id,
    value,
    ...ariaOf(field),
    autoComplete: 'off',
    spellCheck: false,
  } as const;
  return (
    <Field {...field}>
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
