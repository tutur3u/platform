'use client';

import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useRef, useState } from 'react';
import { RecipientChip } from './recipient-chip';
import { RecipientPeoplePicker } from './recipient-people-picker';
import {
  isMultiAddressInput,
  recipientKeyAction,
  typedAddressOption,
} from './recipient-ranking';
import {
  type RecipientOption,
  RecipientSuggestions,
  recipientOptionDisabled,
  recipientOptionId,
} from './recipient-suggestions';
import { parseRecipientInput } from './recipient-utils';
import { useRecipientSuggestions } from './use-recipient-suggestions';

export function RecipientField({
  disabledAddresses = [],
  displayNames = {},
  label,
  actions,
  mailboxId,
  onChange,
  onDisplayNamesChange,
  removeLabel,
  recipients,
  workspaceId,
}: {
  disabledAddresses?: string[];
  displayNames?: Record<string, string>;
  label: string;
  actions?: ReactNode;
  mailboxId?: string;
  onChange: (recipients: string[]) => void;
  onDisplayNamesChange?: (displayNames: Record<string, string>) => void;
  removeLabel: (address: string) => string;
  recipients: string[];
  workspaceId?: string;
}) {
  const t = useTranslations('mail.recipient_suggestions');
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const disabled = disabledAddresses.map((value) => value.toLowerCase());
  const excluded = [
    ...recipients.map((value) => value.toLowerCase()),
    ...disabled,
  ];

  const suggestions = useRecipientSuggestions({
    workspaceId,
    mailboxId,
    input,
    open: listOpen && !isMultiAddressInput(input),
    excludedAddresses: excluded,
  });
  const rows = suggestions.kind === 'results' ? suggestions.rows : [];
  const typed = typedAddressOption(input, rows);
  const options: RecipientOption[] = [
    ...(typed && !excluded.includes(typed.address)
      ? [
          {
            type: 'address' as const,
            key: `address:${typed.address}`,
            ...typed,
          },
        ]
      : []),
    ...rows.map((row) => ({ type: 'suggestion' as const, key: row.key, row })),
  ];
  const enabledIndexes = options.flatMap((option, index) =>
    recipientOptionDisabled(option) ? [] : [index]
  );
  const active = enabledIndexes.includes(activeIndex)
    ? activeIndex
    : (enabledIndexes[0] ?? -1);
  const visible =
    suggestions.kind !== 'closed' &&
    (options.length > 0 ||
      (Boolean(input.trim()) &&
        (suggestions.kind === 'loading' ||
          suggestions.kind === 'error' ||
          suggestions.kind === 'empty')));

  const addRecipient = (address: string, displayName: string | null) => {
    if (!excluded.includes(address)) onChange([...recipients, address]);
    if (displayName) onDisplayNamesChange?.({ [address]: displayName });
    setInput('');
    setInvalid(false);
    setActiveIndex(0);
    setNavigated(false);
    setListOpen(false);
  };
  const select = (option: RecipientOption) => {
    if (option.type === 'address') {
      addRecipient(option.address, option.displayName);
    } else if (option.row.email) {
      addRecipient(option.row.email, option.row.name);
    }
  };
  const move = (step: 1 | -1) => {
    if (!enabledIndexes.length) return;
    const position = enabledIndexes.indexOf(active);
    const next =
      (position + step + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[next]!);
    setNavigated(true);
  };

  const commit = () => {
    const parsed = parseRecipientInput(input);
    if (parsed.length === 0) return !input.trim();
    if (parsed.some((recipient) => !recipient.valid)) {
      setInvalid(true);
      return false;
    }
    onChange([
      ...new Set(
        [...recipients, ...parsed.map((recipient) => recipient.address)].filter(
          (value) => !disabled.includes(value)
        )
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
    return true;
  };

  const activeOption = visible && active >= 0 ? options[active] : undefined;

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start border-dynamic border-b px-3">
      <span className="pt-3 text-muted-foreground text-xs">{label}</span>
      <Popover open={visible}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5',
              invalid && 'text-destructive'
            )}
            ref={anchorRef}
          >
            {recipients.map((recipient) => (
              <RecipientChip
                address={recipient}
                displayName={displayNames[recipient.toLowerCase()]}
                key={recipient}
                onRemove={() =>
                  onChange(recipients.filter((value) => value !== recipient))
                }
                removeLabel={removeLabel(recipient)}
                workspaceId={workspaceId}
              />
            ))}
            <Input
              aria-activedescendant={
                activeOption
                  ? recipientOptionId(listboxId, activeOption)
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls={visible ? listboxId : undefined}
              aria-expanded={visible}
              aria-invalid={invalid}
              aria-label={label}
              className="h-8 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none outline-none focus-visible:outline-none focus-visible:ring-0"
              onBlur={() => {
                setListOpen(false);
                commit();
              }}
              onChange={(event) => {
                setInput(event.target.value);
                setInvalid(false);
                setActiveIndex(0);
                setNavigated(false);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                const modifier =
                  (event.ctrlKey || event.metaKey) &&
                  !event.altKey &&
                  !event.shiftKey;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  if (!visible) setListOpen(true);
                  else move(event.key === 'ArrowDown' ? 1 : -1);
                  return;
                }
                if (
                  activeOption &&
                  !modifier &&
                  (event.key === 'Enter' ||
                    (event.key === 'Tab' && !event.shiftKey))
                ) {
                  const action = recipientKeyAction({
                    key: event.key,
                    input,
                    navigated,
                    optionType: activeOption.type,
                    stale: suggestions.kind === 'results' && suggestions.stale,
                  });
                  if (action !== 'pass') {
                    event.preventDefault();
                    if (action === 'pick') select(activeOption);
                    return;
                  }
                }
                if (event.key === 'Escape' && visible) {
                  event.preventDefault();
                  setListOpen(false);
                  return;
                }
                if (
                  event.key === 'Escape' ||
                  (modifier && ['enter', 's'].includes(event.key.toLowerCase()))
                ) {
                  if (!commit()) event.preventDefault();
                  return;
                }
                if (['Enter', ',', ';'].includes(event.key)) {
                  event.preventDefault();
                  commit();
                }
                if (event.key === 'Backspace' && !input && recipients.length) {
                  // Turns the last chip back into editable text.
                  event.preventDefault();
                  setInput(recipients.at(-1)!);
                  onChange(recipients.slice(0, -1));
                }
              }}
              placeholder={recipients.length ? undefined : t('placeholder')}
              role="combobox"
              value={input}
            />
            {workspaceId ? (
              <RecipientPeoplePicker
                workspaceId={workspaceId}
                fieldLabel={label}
                excludedAddresses={excluded}
                onSelect={({ address, displayName }) =>
                  addRecipient(address, displayName)
                }
              />
            ) : null}
            {actions ? (
              <div className="flex shrink-0 items-center gap-1">{actions}</div>
            ) : null}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-2rem)] p-0"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node))
              event.preventDefault();
            else setListOpen(false);
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <RecipientSuggestions
            activeIndex={active}
            input={input}
            label={t('label', { field: label })}
            listboxId={listboxId}
            onActivate={setActiveIndex}
            onSelect={select}
            options={options}
            state={suggestions}
            workspaceId={workspaceId}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
