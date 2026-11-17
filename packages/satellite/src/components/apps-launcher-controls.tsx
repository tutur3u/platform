import { ArrowRight, ExternalLink, Search, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DialogClose } from '@tuturuuu/ui/dialog';
import { Kbd } from '@tuturuuu/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import type { KeyboardEventHandler } from 'react';
import {
  APPS_LAUNCHER_LISTBOX_ID,
  type AppOpenMode,
} from './apps-launcher-catalog';

export function AppsLauncherSearchBar({
  activeEntryId,
  closeLabel,
  onQueryChange,
  onSearchKeyDown,
  query,
  searchLabel,
}: {
  activeEntryId?: string;
  closeLabel: string;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: KeyboardEventHandler<HTMLInputElement>;
  query: string;
  searchLabel: string;
}) {
  return (
    <div
      className="flex h-14 shrink-0 items-center gap-2.5 border-b pr-2.5 pl-4 text-muted-foreground"
      data-slot="apps-launcher-search-bar"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <input
        aria-activedescendant={activeEntryId}
        aria-autocomplete="list"
        aria-controls={APPS_LAUNCHER_LISTBOX_ID}
        aria-expanded="true"
        aria-label={searchLabel}
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent font-medium text-base text-foreground outline-none placeholder:text-muted-foreground"
        data-slot="apps-launcher-search"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder={searchLabel}
        role="combobox"
        spellCheck={false}
        type="text"
        value={query}
      />
      <Kbd className="hidden sm:inline-flex" data-slot="apps-launcher-esc">
        Esc
      </Kbd>
      <DialogClose asChild>
        <Button
          aria-label={closeLabel}
          className="size-8 shrink-0 sm:hidden"
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="size-4" />
        </Button>
      </DialogClose>
    </div>
  );
}

const OPEN_MODE_ITEM_CLASS =
  'h-7 gap-1.5 rounded-(--radius-inner) border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:!bg-accent data-[selected=true]:!text-accent-foreground';

export function AppsLauncherOpenModeMenu({
  currentLabel,
  label,
  mode,
  newLabel,
  onModeChange,
  optionsLabel,
}: {
  currentLabel: string;
  label: string;
  mode: AppOpenMode;
  newLabel: string;
  onModeChange: (mode: AppOpenMode) => void;
  optionsLabel: string;
}) {
  const ModeIcon = mode === 'new-tab' ? ExternalLink : ArrowRight;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={optionsLabel}
          className="ml-auto h-7 gap-1.5 px-2 font-medium text-muted-foreground text-xs"
          data-slot="apps-launcher-preference-trigger"
          size="sm"
          type="button"
          variant="ghost"
        >
          <ModeIcon aria-hidden className="size-3.5" />
          {mode === 'new-tab' ? newLabel : currentLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto space-y-2 p-2"
        data-slot="apps-launcher-open-mode"
        side="top"
        sideOffset={8}
      >
        <p className="px-1 font-medium text-muted-foreground text-xs">
          {label}
        </p>
        <ToggleGroup
          aria-label={optionsLabel}
          className="grid grid-cols-2 gap-1"
          onValueChange={(value) => {
            if (value === 'current-tab' || value === 'new-tab') {
              onModeChange(value);
            }
          }}
          type="single"
          value={mode}
        >
          <ToggleGroupItem
            aria-label={currentLabel}
            className={cn(OPEN_MODE_ITEM_CLASS)}
            data-selected={mode === 'current-tab'}
            value="current-tab"
          >
            <ArrowRight aria-hidden className="size-3.5" />
            <span>{currentLabel}</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label={newLabel}
            className={cn(OPEN_MODE_ITEM_CLASS)}
            data-selected={mode === 'new-tab'}
            value="new-tab"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            <span>{newLabel}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}
