'use client';

import { CircleAlert, LoaderCircle } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { RecipientSuggestion } from './recipient-ranking';
import {
  RecipientSuggestionRow,
  TypedAddressRow,
} from './recipient-suggestion-row';
import type { RecipientSuggestionsState } from './use-recipient-suggestions';

export type RecipientOption =
  | {
      type: 'address';
      key: string;
      address: string;
      displayName: string | null;
    }
  | { type: 'suggestion'; key: string; row: RecipientSuggestion };

export function recipientOptionDisabled(option: RecipientOption) {
  return option.type === 'suggestion' && !option.row.email;
}

export function recipientOptionId(listboxId: string, option: RecipientOption) {
  return `${listboxId}-${option.key.replace(/[^a-zA-Z0-9_-]/gu, '_')}`;
}

/** Ranked suggestion list for one recipient field (one list, no groups). */
export function RecipientSuggestions({
  listboxId,
  label,
  state,
  options,
  activeIndex,
  input,
  workspaceId,
  onActivate,
  onSelect,
}: {
  listboxId: string;
  label: string;
  state: RecipientSuggestionsState;
  options: readonly RecipientOption[];
  activeIndex: number;
  input: string;
  workspaceId?: string;
  onActivate: (index: number) => void;
  onSelect: (option: RecipientOption) => void;
}) {
  const t = useTranslations('mail.recipient_suggestions');
  const query = state.kind === 'results' ? state.query : input.trim();
  const showRecentHeader = state.kind === 'results' && !state.query;

  return (
    // Pointer presses keep focus in the input so blur does not commit text.
    <div onMouseDown={(event) => event.preventDefault()}>
      {showRecentHeader ? (
        <div className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs">
          {t('recent')}
        </div>
      ) : null}
      {options.length ? (
        <div
          aria-label={label}
          className="max-h-80 overflow-y-auto p-1"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const disabled = recipientOptionDisabled(option);
            return (
              <div
                aria-disabled={disabled || undefined}
                aria-selected={index === activeIndex}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                  index === activeIndex && 'bg-accent text-accent-foreground',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
                id={recipientOptionId(listboxId, option)}
                key={option.key}
                onClick={() => {
                  if (!disabled) onSelect(option);
                }}
                onMouseMove={() => {
                  if (!disabled && index !== activeIndex) onActivate(index);
                }}
                role="option"
              >
                {option.type === 'address' ? (
                  <TypedAddressRow address={option.address} />
                ) : (
                  <RecipientSuggestionRow
                    query={query}
                    row={option.row}
                    workspaceId={workspaceId}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {state.kind === 'loading' && !options.length ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-muted-foreground text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {t('loading')}
        </div>
      ) : null}
      {state.kind === 'error' && !options.length ? (
        <div
          className="px-3 py-2.5 text-muted-foreground text-sm"
          role="status"
        >
          {t('error')}
        </div>
      ) : null}
      {state.kind === 'empty' && !options.length && state.query ? (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 text-sm"
          role="status"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {t('no_one_matches', { query: state.query })}
            </span>
            <span className="block text-muted-foreground text-xs">
              {t('type_full_address')}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
