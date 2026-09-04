'use client';

import { Command, CommandInput, CommandList } from '@tuturuuu/ui/command';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type { KeyboardEvent, ReactNode } from 'react';
import type { CommandLauncherTab } from './command-launcher-tabs';
import { CommandLauncherTabs } from './command-launcher-tabs';
import type { GlobalCommandLauncherLabels } from './global-command-launcher';

export function CommandLauncherChrome({
  activeTab,
  availableTabs,
  children,
  contextLabel,
  labels,
  onInputKeyDown,
  onQueryChange,
  onTabChange,
  query,
}: {
  activeTab: CommandLauncherTab;
  availableTabs: readonly CommandLauncherTab[];
  children: ReactNode;
  contextLabel: string;
  labels: GlobalCommandLauncherLabels;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (query: string) => void;
  onTabChange: (tab: CommandLauncherTab) => void;
  query: string;
}) {
  return (
    <DialogContent
      aria-label={labels.title}
      className="grid h-[min(680px,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-[min(760px,calc(100vw-1.5rem))] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border-border/70 bg-background/96 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[760px]"
      showCloseButton={false}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>{labels.searchHint}</DialogDescription>
      </DialogHeader>
      <Command
        className="flex h-full min-h-0 flex-col rounded-none border-none bg-transparent"
        loop
        shouldFilter={false}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 [&_[data-slot=command-input-wrapper]]:h-10 [&_[data-slot=command-input-wrapper]]:min-w-0 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:px-0">
          <CommandInput
            aria-label={labels.title}
            autoFocus
            className="h-10 flex-1 border-0 px-0 text-[15px] shadow-none focus-visible:ring-0"
            onKeyDown={onInputKeyDown}
            onValueChange={onQueryChange}
            placeholder={labels.placeholder}
            value={query}
          />
          <span className="hidden max-w-40 truncate rounded-md border bg-muted/35 px-2 py-1 text-muted-foreground text-xs sm:block">
            {contextLabel}
          </span>
          <kbd className="hidden rounded-md border bg-background px-1.5 py-1 font-mono text-[10px] text-muted-foreground shadow-xs md:block">
            Esc
          </kbd>
        </div>

        {availableTabs.length > 1 ? (
          <CommandLauncherTabs
            activeTab={activeTab}
            ariaLabel={labels.categories}
            availableTabs={availableTabs}
            labels={{
              actions: labels.actions,
              all: labels.all,
              apps: labels.apps,
              navigation: labels.navigation,
              tasks: labels.tasks,
            }}
            onChange={onTabChange}
          />
        ) : null}

        <CommandList className="max-h-none min-h-0 flex-1 scroll-py-2 overflow-y-auto p-2">
          {children}
        </CommandList>

        <div className="flex min-h-10 items-center justify-between gap-3 overflow-x-auto border-t bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex shrink-0 items-center gap-3">
            <Hint keys="↑↓" label={labels.navigate} />
            <Hint keys="↵" label={labels.select} />
            <Hint keys="Esc" label={labels.close} />
          </div>
          <span className="hidden shrink-0 md:block">{labels.searchHint}</span>
        </div>
      </Command>
    </DialogContent>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
