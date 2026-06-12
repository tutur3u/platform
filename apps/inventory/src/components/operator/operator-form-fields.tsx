'use client';

import type { ReactNode } from 'react';

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
  placeholder?: string;
  value: string;
}) {
  return (
    <label className={`grid gap-1 text-sm ${className ?? ''}`}>
      <span className="font-medium">{label}</span>
      <input
        className="h-10 rounded-md border border-input bg-background px-3"
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
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={`grid gap-1 text-sm ${className ?? ''}`}>
      <span className="font-medium">{label}</span>
      <textarea
        className="min-h-20 rounded-md border border-input bg-background px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

export function SelectField({
  label,
  onChange,
  options = [],
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options?: { id: string; name?: string | null }[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{label}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name ?? item.id}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SelectValueField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
      <input
        checked={checked}
        className="h-4 w-4"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
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
