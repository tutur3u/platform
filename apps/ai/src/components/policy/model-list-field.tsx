'use client';

import { Plus, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useId, useState } from 'react';

/**
 * Model identifiers are typed, not picked: the catalog is workspace- and
 * plan-dependent, so a free-text chip list keeps the field honest instead of
 * pretending to know every id up front.
 */
export function ModelListField({
  addLabel,
  description,
  disabled,
  emptyLabel,
  label,
  onChange,
  placeholder,
  removeLabel,
  value,
}: {
  addLabel: string;
  description?: string;
  disabled?: boolean;
  emptyLabel: string;
  label: string;
  onChange: (value: string[]) => void;
  placeholder: string;
  removeLabel: string;
  value: string[];
}) {
  const inputId = useId();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const entries = draft
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry && !value.includes(entry));
    if (entries.length) onChange([...value, ...entries]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      {description ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Input
          disabled={disabled}
          id={inputId}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          value={draft}
        />
        <Button
          disabled={disabled || !draft.trim()}
          onClick={commit}
          size="icon"
          type="button"
          variant="outline"
        >
          <Plus className="size-4" />
          <span className="sr-only">{addLabel}</span>
        </Button>
      </div>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((model) => (
            <li key={model}>
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 font-mono text-xs">
                {model}
                <Button
                  className="size-5"
                  disabled={disabled}
                  onClick={() =>
                    onChange(value.filter((entry) => entry !== model))
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3" />
                  <span className="sr-only">
                    {removeLabel} {model}
                  </span>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}
