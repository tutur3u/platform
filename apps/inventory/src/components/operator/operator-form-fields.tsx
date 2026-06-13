'use client';

import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Combobox,
  type ComboboxAction,
  type ComboboxCreateResult,
  type ComboboxOption,
} from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

export function TextField({
  className,
  disabled,
  inputMode,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  disabled?: boolean;
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
        disabled={disabled}
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
  actions,
  allowEmpty = true,
  className,
  createText,
  creatingText,
  emptyText,
  label,
  onChange,
  onCreate,
  options = [],
  placeholder,
  searchPlaceholder,
  value,
}: {
  actions?: ComboboxAction[];
  allowEmpty?: boolean;
  className?: string;
  createText?: string;
  creatingText?: string;
  emptyText?: string;
  label: string;
  onChange: (value: string) => void;
  onCreate?: (value: string) => ComboboxCreateResult | Promise<unknown>;
  options?: { id: string; name?: string | null }[];
  placeholder: string;
  searchPlaceholder?: string;
  value: string;
}) {
  const [pendingCreatedName, setPendingCreatedName] = useState<string | null>(
    null
  );
  const normalizedPendingCreatedName = normalizeOptionText(
    pendingCreatedName ?? ''
  );
  const comboboxOptions = useMemo<ComboboxOption[]>(
    () => [
      ...(allowEmpty
        ? [
            {
              label: placeholder,
              muted: true,
              searchValue: placeholder,
              value: '',
            },
          ]
        : []),
      ...options.map((item) => ({
        label: item.name ?? item.id,
        searchValue: `${item.name ?? ''} ${item.id}`,
        value: item.id,
      })),
    ],
    [allowEmpty, options, placeholder]
  );

  useEffect(() => {
    if (!normalizedPendingCreatedName) return;

    const match = options.find(
      (option) =>
        normalizeOptionText(option.name ?? option.id) ===
        normalizedPendingCreatedName
    );

    if (!match) return;

    onChange(match.id);
    setPendingCreatedName(null);
  }, [normalizedPendingCreatedName, onChange, options]);

  const handleCreate = onCreate
    ? async (name: string): Promise<ComboboxCreateResult> => {
        const result = await onCreate(name);
        const option = optionFromCreateResult(result, name);

        if (!option) {
          setPendingCreatedName(name);
        }

        return option;
      }
    : undefined;

  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <Combobox
        actions={actions}
        className="min-w-0"
        createText={createText}
        creatingText={creatingText}
        emptyText={emptyText}
        onChange={(nextValue) =>
          onChange(typeof nextValue === 'string' ? nextValue : '')
        }
        onCreate={handleCreate}
        options={comboboxOptions}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder ?? placeholder}
        selected={value}
      />
    </label>
  );
}

export function SelectValueField({
  actions,
  allowEmpty = true,
  className,
  emptyText,
  label,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  value,
}: {
  actions?: ComboboxAction[];
  allowEmpty?: boolean;
  className?: string;
  emptyText?: string;
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  searchPlaceholder?: string;
  value: string;
}) {
  const comboboxOptions = useMemo<ComboboxOption[]>(
    () => [
      ...(allowEmpty
        ? [
            {
              label: placeholder,
              muted: true,
              searchValue: placeholder,
              value: '',
            },
          ]
        : []),
      ...options,
    ],
    [allowEmpty, options, placeholder]
  );

  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <Combobox
        actions={actions}
        className="min-w-0"
        emptyText={emptyText}
        onChange={(nextValue) =>
          onChange(typeof nextValue === 'string' ? nextValue : '')
        }
        options={comboboxOptions}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder ?? placeholder}
        selected={value}
      />
    </label>
  );
}

export function ToggleField({
  checked,
  children,
  className,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  className?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm',
        className
      )}
    >
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

function normalizeOptionText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function optionFromCreateResult(
  result: unknown,
  fallbackName: string
): ComboboxCreateResult {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return undefined;

  if ('value' in result && typeof result.value === 'string') {
    return result as ComboboxOption;
  }

  const maybeData =
    'data' in result && result.data && typeof result.data === 'object'
      ? result.data
      : result;

  if (
    maybeData &&
    typeof maybeData === 'object' &&
    'id' in maybeData &&
    typeof maybeData.id === 'string'
  ) {
    const name =
      'name' in maybeData && typeof maybeData.name === 'string'
        ? maybeData.name
        : fallbackName;

    return {
      label: name,
      searchValue: `${name} ${maybeData.id}`,
      value: maybeData.id,
    };
  }

  return undefined;
}
