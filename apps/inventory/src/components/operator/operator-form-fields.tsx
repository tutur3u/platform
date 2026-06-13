'use client';

import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

const EMPTY_SELECT_VALUE = '__inventory_empty__';

export function TextField({
  className,
  inputMode,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  inputMode?:
    | 'decimal'
    | 'email'
    | 'numeric'
    | 'search'
    | 'tel'
    | 'text'
    | 'url';
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <Input
        className="h-10"
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

export function NumberField(
  props: Omit<Parameters<typeof TextField>[0], 'inputMode'>
) {
  return <TextField {...props} inputMode="numeric" />;
}

export function TextAreaField({
  className,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <Textarea
        className="min-h-20"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

export function SelectField({
  className,
  label,
  onChange,
  options = [],
  placeholder,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options?: { id: string; name?: string | null }[];
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <Select
        onValueChange={(nextValue) =>
          onChange(nextValue === EMPTY_SELECT_VALUE ? '' : nextValue)
        }
        value={value || EMPTY_SELECT_VALUE}
      >
        <SelectTrigger className="h-10 min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SELECT_VALUE}>{placeholder}</SelectItem>
          {options.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name ?? item.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function SelectValueField({
  className,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <Select
        onValueChange={(nextValue) =>
          onChange(nextValue === EMPTY_SELECT_VALUE ? '' : nextValue)
        }
        value={value || EMPTY_SELECT_VALUE}
      >
        <SelectTrigger className="h-10 min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SELECT_VALUE}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function ToggleField({
  checked,
  children,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(nextChecked) => onChange(nextChecked === true)}
      />
      <span>{children}</span>
    </label>
  );
}

export function labelFor(
  options: { id: string; name?: string | null }[] = [],
  id: string
) {
  return options.find((option) => option.id === id)?.name ?? id;
}

export function ReviewRows({
  rows,
  termWidthClassName = 'sm:grid-cols-[160px_1fr]',
}: {
  rows: [string, string][];
  termWidthClassName?: string;
}) {
  return (
    <dl className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
      {rows.map(([label, value]) => (
        <div
          className={`grid gap-1 rounded-md bg-background p-3 ${termWidthClassName}`}
          key={label}
        >
          <dt className="text-muted-foreground text-sm">{label}</dt>
          <dd className="break-words font-medium text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
