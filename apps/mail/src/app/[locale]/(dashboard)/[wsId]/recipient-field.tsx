'use client';

import { X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useState } from 'react';
import { parseRecipientInput } from './recipient-utils';

export function RecipientField({
  disabledAddresses = [],
  displayNames = {},
  label,
  actions,
  onChange,
  onDisplayNamesChange,
  removeLabel,
  recipients,
}: {
  disabledAddresses?: string[];
  displayNames?: Record<string, string>;
  label: string;
  actions?: ReactNode;
  onChange: (recipients: string[]) => void;
  onDisplayNamesChange?: (displayNames: Record<string, string>) => void;
  removeLabel: (address: string) => string;
  recipients: string[];
}) {
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const parsed = parseRecipientInput(input);
    if (parsed.length === 0) return;
    if (parsed.some((recipient) => !recipient.valid)) {
      setInvalid(true);
      return;
    }
    const excluded = new Set(
      disabledAddresses.map((value) => value.toLowerCase())
    );
    const candidates = parsed.map((recipient) => recipient.address);
    onChange([
      ...new Set(
        [...recipients, ...candidates].filter((value) => !excluded.has(value))
      ),
    ]);
    onDisplayNamesChange?.(
      Object.fromEntries(
        parsed.flatMap((recipient) =>
          recipient.displayName
            ? [[recipient.address, recipient.displayName] as const]
            : []
        )
      )
    );
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
            <span className="max-w-56 truncate">
              {displayNames[recipient.toLowerCase()]
                ? `${displayNames[recipient.toLowerCase()]} <${recipient}>`
                : recipient}
            </span>
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
          className="h-8 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none outline-none focus-visible:outline-none focus-visible:ring-0"
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
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
