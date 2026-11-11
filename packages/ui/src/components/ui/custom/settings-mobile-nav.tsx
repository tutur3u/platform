'use client';

import { Check, ChevronDown } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@tuturuuu/ui/drawer';
import { cn } from '@tuturuuu/utils/format';
import type { RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import type {
  SettingsNavGroup,
  SettingsNavItem,
} from './satellite-settings-dialog-shell';

/** The cmdk value of a navigation entry; cmdk stores values trimmed. */
export function getSettingsCommandValue(
  group: SettingsNavGroup,
  item: SettingsNavItem
) {
  return [
    group.label,
    item.label,
    item.description,
    ...(item.keywords ?? []),
    ...(item.aliases ?? []),
    ...(item.searchLabels ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

interface SettingsMobileNavLabels {
  description: string;
  noResults: string;
  searchPlaceholder: string;
  title: string;
}

interface SettingsMobileNavProps {
  /** The unfiltered group that owns the active tab. */
  activeGroup?: SettingsNavGroup;
  activeItem?: SettingsNavItem;
  activeTab: string;
  labels: SettingsMobileNavLabels;
  navItems: SettingsNavGroup[];
  onOpenChange: (open: boolean) => void;
  onSearchChange: (query: string) => void;
  onSearchFocus: () => void;
  onSelect: (tab: string) => void;
  open: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
}

export function SettingsMobileNav({
  activeGroup,
  activeItem,
  activeTab,
  labels,
  navItems,
  onOpenChange,
  onSearchChange,
  onSearchFocus,
  onSelect,
  open,
  searchInputRef,
  searchQuery,
}: SettingsMobileNavProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full flex-1 justify-between gap-2"
        >
          {activeItem && (
            <>
              <activeItem.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">
                {activeItem.label}
              </span>
            </>
          )}
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="motion-reduce:animate-none! motion-reduce:transition-none!">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{labels.title}</DrawerTitle>
          <DrawerDescription>{labels.description}</DrawerDescription>
        </DrawerHeader>
        <SettingsMobileNavList
          activeGroup={activeGroup}
          activeTab={activeTab}
          labels={labels}
          navItems={navItems}
          onSearchChange={onSearchChange}
          onSearchFocus={onSearchFocus}
          onSelect={(tab) => {
            onSelect(tab);
            onOpenChange(false);
          }}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
        />
      </DrawerContent>
    </Drawer>
  );
}

type SettingsMobileNavListProps = Pick<
  SettingsMobileNavProps,
  | 'activeGroup'
  | 'activeTab'
  | 'labels'
  | 'navItems'
  | 'onSearchChange'
  | 'onSearchFocus'
  | 'onSelect'
  | 'searchInputRef'
  | 'searchQuery'
>;

/**
 * The drawer mounts this list on every open, so its single highlight starts on
 * the current section. Pointer selection is off: touch and hover never move
 * the highlight, and only the keyboard or search does.
 */
export function SettingsMobileNavList({
  activeGroup,
  activeTab,
  labels,
  navItems,
  onSearchChange,
  onSearchFocus,
  onSelect,
  searchInputRef,
  searchQuery,
}: SettingsMobileNavListProps) {
  const activeEntry = activeGroup?.items.find(
    (item) => item.name === activeTab
  );
  const activeValue =
    activeGroup && activeEntry
      ? getSettingsCommandValue(activeGroup, activeEntry)
      : '';
  const [value, setValue] = useState(activeValue);
  const pinActiveValueRef = useRef(false);

  // cmdk selects the first result whenever the query changes. Clearing the
  // query returns the highlight to the current section instead. cmdk stores
  // its new selection before reporting it, so the pinned value must reach it
  // as a changed prop even when this state already holds the active value;
  // cmdk trims controlled values, so the padded variant selects the same item.
  const handleValueChange = useCallback(
    (next: string) => {
      if (pinActiveValueRef.current) {
        pinActiveValueRef.current = false;
        setValue((previous) =>
          previous === activeValue ? `${activeValue} ` : activeValue
        );
        return;
      }
      setValue(next);
    },
    [activeValue]
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      if (!query) {
        pinActiveValueRef.current = true;
        setValue(activeValue);
        requestAnimationFrame(() => {
          pinActiveValueRef.current = false;
        });
      }
      onSearchChange(query);
    },
    [activeValue, onSearchChange]
  );

  return (
    <Command
      className="rounded-none border-0"
      disablePointerSelection
      onValueChange={handleValueChange}
      shouldFilter={false}
      value={value}
    >
      <CommandInput
        ref={searchInputRef}
        value={searchQuery}
        onFocus={onSearchFocus}
        onValueChange={handleSearchChange}
        placeholder={labels.searchPlaceholder}
        className="h-11"
      />
      <CommandList className="max-h-[60vh] overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <CommandEmpty>{labels.noResults}</CommandEmpty>
        {navItems.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => {
              const isCurrent =
                group.label === activeGroup?.label && item.name === activeTab;

              return (
                <CommandItem
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'min-h-11 gap-3 px-3 py-2',
                    isCurrent && 'font-medium'
                  )}
                  disabled={item.disabled}
                  key={item.name}
                  onSelect={() => {
                    if (!item.disabled) onSelect(item.name);
                  }}
                  value={getSettingsCommandValue(group, item)}
                >
                  <item.icon className="h-4 w-4" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.label}</span>
                    {item.description && (
                      <span className="line-clamp-1 font-normal text-muted-foreground text-xs">
                        {item.description}
                      </span>
                    )}
                  </div>
                  {isCurrent && (
                    <Check
                      aria-hidden="true"
                      className="size-4 text-foreground"
                      data-testid="settings-mobile-current-check"
                    />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
