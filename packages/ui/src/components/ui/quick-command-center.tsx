'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './command';

export interface QuickCommandCenterItem {
  id: string;
  title: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  keywords?: string[];
  onSelect: () => void;
  shortcut?: string;
}

export interface QuickCommandCenterGroup {
  heading: string;
  id: string;
  items: QuickCommandCenterItem[];
}

interface QuickCommandCenterProps {
  digitShortcuts?: boolean;
  emptyLabel: string;
  groups: QuickCommandCenterGroup[];
  onOpenChange: (open: boolean) => void;
  onSearchValueChange?: (value: string) => void;
  open: boolean;
  placeholder: string;
  searchValue?: string;
  title: string;
  description?: string;
}

function matchesSearch(item: QuickCommandCenterItem, query: string) {
  if (!query) return true;

  const haystack = [
    item.title,
    item.description,
    item.shortcut,
    ...(item.keywords ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function QuickCommandCenter({
  digitShortcuts = false,
  emptyLabel,
  groups,
  onOpenChange,
  onSearchValueChange,
  open,
  placeholder,
  searchValue,
  title,
  description,
}: QuickCommandCenterProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const query = searchValue ?? internalSearch;
  const setQuery = onSearchValueChange ?? setInternalSearch;

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => matchesSearch(item, query)),
        }))
        .filter((group) => group.items.length > 0),
    [groups, query]
  );
  const visibleItems = visibleGroups.flatMap((group) => group.items);

  useEffect(() => {
    if (!(open && digitShortcuts)) return;

    const handleDigitShortcut = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing ||
        !/^[0-9]$/u.test(event.key)
      ) {
        return;
      }

      const index = event.key === '0' ? 9 : Number(event.key) - 1;
      const item = visibleItems[index];

      if (!item || item.disabled) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      item.onSelect();
    };

    window.addEventListener('keydown', handleDigitShortcut, {
      capture: true,
    });

    return () =>
      window.removeEventListener('keydown', handleDigitShortcut, {
        capture: true,
      });
  }, [digitShortcuts, open, visibleItems]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description ?? title}
      contentClassName="max-w-xl"
    >
      <CommandInput
        placeholder={placeholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[min(70vh,28rem)]">
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        {visibleGroups.map((group) => (
          <CommandGroup heading={group.heading} key={group.id}>
            {group.items.map((item) => {
              const itemIndex = visibleItems.findIndex(
                (visibleItem) => visibleItem.id === item.id
              );
              const digitShortcut =
                digitShortcuts && itemIndex >= 0 && itemIndex < 10
                  ? itemIndex === 9
                    ? '0'
                    : String(itemIndex + 1)
                  : item.shortcut;

              return (
                <CommandItem
                  disabled={item.disabled}
                  key={item.id}
                  onSelect={() => {
                    if (!item.disabled) item.onSelect();
                  }}
                  value={[
                    item.title,
                    item.description,
                    item.shortcut,
                    ...(item.keywords ?? []),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {item.title}
                    </span>
                    {item.description && (
                      <span className="block truncate text-muted-foreground text-xs">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {digitShortcut && (
                    <CommandShortcut>{digitShortcut}</CommandShortcut>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
