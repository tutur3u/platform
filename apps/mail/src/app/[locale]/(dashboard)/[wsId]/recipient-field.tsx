'use client';

import { X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function RecipientField({
  disabledAddresses = [],
  label,
  onChange,
  removeLabel,
  recipients,
}: {
  disabledAddresses?: string[];
  label: string;
  onChange: (recipients: string[]) => void;
  removeLabel: (address: string) => string;
  recipients: string[];
}) {
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const candidates = input
      .split(/[;,\s]+/u)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (candidates.length === 0) return;
    if (candidates.some((value) => !EMAIL_PATTERN.test(value))) {
      setInvalid(true);
      return;
    }
    const excluded = new Set(
      disabledAddresses.map((value) => value.toLowerCase())
    );
    onChange([
      ...new Set(
        [...recipients, ...candidates].filter((value) => !excluded.has(value))
      ),
    ]);
    setInput('');
    setInvalid(false);
  };

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start border-dynamic border-b px-3">
      <span className="pt-3 text-muted-foreground text-xs">{label}</span>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5',
          invalid && 'text-destructive'
        )}
      >
        {recipients.map((recipient) => (
          <Badge
            className="gap-1 rounded-lg py-1 font-normal"
            key={recipient}
            variant="secondary"
          >
            {recipient}
            <button
              aria-label={removeLabel(recipient)}
              className="rounded-sm opacity-60 hover:opacity-100"
              onClick={() =>
                onChange(recipients.filter((value) => value !== recipient))
              }
              type="button"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          aria-invalid={invalid}
          className="h-8 min-w-40 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          onBlur={commit}
          onChange={(event) => {
            setInput(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (['Enter', ',', ';'].includes(event.key)) {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Backspace' && !input && recipients.length) {
              onChange(recipients.slice(0, -1));
            }
          }}
          value={input}
        />
      </div>
    </div>
  );
}
