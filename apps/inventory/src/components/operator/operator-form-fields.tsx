'use client';

import { Info } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
import {
  Combobox,
  type ComboboxAction,
  type ComboboxCreateResult,
  type ComboboxOption,
} from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

/**
 * A small info icon that reveals an explanatory hint on hover/focus/tap. Built
 * on the shared Button primitive so it stays keyboard- and touch-accessible.
 */
export function HintIcon({ hint }: { hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={hint}
          className="size-5 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={(event) => event.preventDefault()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-pretty leading-snug">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Renders a field label with an optional info-icon tooltip. The hint keeps
 * forms approachable for non-technical operators without cluttering the layout
 * with permanent helper text.
 */
export function FieldLabel({ hint, label }: { hint?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-medium">
      {label}
      {hint ? <HintIcon hint={hint} /> : null}
    </span>
  );
}

export function TextField({
  className,
  disabled,
  hint,
  inputMode,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  disabled?: boolean;
  hint?: string;
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
      <FieldLabel hint={hint} label={label} />
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

export function DecimalField(
  props: Omit<Parameters<typeof TextField>[0], 'inputMode'>
) {
  return <TextField {...props} inputMode="decimal" />;
}

/**
 * A color field that pairs a visual swatch/picker with a hex text input, so
 * non-technical operators can pick a brand color instead of guessing hex codes,
 * while power users can still paste an exact value.
 */
export function ColorField({
  className,
  hint,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  hint?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <FieldLabel hint={hint} label={label} />
      <div className="flex min-w-0 items-center gap-2">
        <ColorPicker
          aria-label={label}
          className="size-10 shrink-0"
          onChange={(next) => onChange(next ?? '')}
          value={value || '#4F46E5'}
        />
        <Input
          className="h-10"
          inputMode="text"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    </label>
  );
}

export function TextAreaField({
  className,
  hint,
  label,
  maxLength,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  hint?: string;
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1 text-sm', className)}>
      <FieldLabel hint={hint} label={label} />
      <Textarea
        className="min-h-20"
        maxLength={maxLength}
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
  disabled,
  emptyText,
  hint,
  label,
  onChange,
  onCreate,
  onSearchChange,
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
  disabled?: boolean;
  emptyText?: string;
  hint?: string;
  label: string;
  onChange: (value: string) => void;
  onCreate?: (value: string) => ComboboxCreateResult | Promise<unknown>;
  onSearchChange?: (value: string) => void;
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
      <FieldLabel hint={hint} label={label} />
      <Combobox
        actions={actions}
        className="min-w-0"
        createText={createText}
        creatingText={creatingText}
        disabled={disabled}
        emptyText={emptyText}
        onChange={(nextValue) =>
          onChange(typeof nextValue === 'string' ? nextValue : '')
        }
        onCreate={handleCreate}
        onSearchChange={onSearchChange}
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
  disabled,
  emptyText,
  hint,
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
  disabled?: boolean;
  emptyText?: string;
  hint?: string;
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
      <FieldLabel hint={hint} label={label} />
      <Combobox
        actions={actions}
        className="min-w-0"
        disabled={disabled}
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
  hint,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  className?: string;
  hint?: string;
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
      <span className="flex-1">{children}</span>
      {hint ? <HintIcon hint={hint} /> : null}
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
