'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Command, CommandInput, CommandList } from '@tuturuuu/ui/command';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import type { KeyboardEvent, ReactNode } from 'react';
import type { CommandLauncherTab } from './command-launcher-tabs';
import { CommandLauncherTabs } from './command-launcher-tabs';
import type { GlobalCommandLauncherLabels } from './command-launcher-types';

/**
 * Containment: the dialog starts max(12px, 9vh) from the top and never
 * extends past 12px above the bottom edge; only the result list scrolls.
 * Below `sm` it becomes a full-width top sheet.
 */
export const COMMAND_CENTER_CONTENT_CLASS_NAME =
  'top-[max(12px,9vh)] flex h-[min(560px,calc(100dvh_-_max(12px,9vh)_-_12px))] max-h-[calc(100dvh_-_max(12px,9vh)_-_12px)] w-[min(680px,calc(100vw_-_1.5rem))] max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-popover p-0 shadow-2xl sm:max-w-none max-sm:top-2 max-sm:h-[calc(100dvh_-_1rem)] max-sm:max-h-[calc(100dvh_-_1rem)] max-sm:w-[calc(100vw_-_1rem)] max-sm:rounded-xl';

export function CommandLauncherChrome({
  actionsPanel,
  activeTab,
  appLabel,
  availableTabs,
  children,
  labels,
  onClose,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onInputKeyDown,
  onQueryChange,
  onTabChange,
  onValueChange,
  query,
  status,
  value,
  workspaceLabel,
}: {
  actionsPanel: ReactNode;
  activeTab: CommandLauncherTab;
  appLabel: string;
  availableTabs: readonly CommandLauncherTab[];
  children: ReactNode;
  labels: GlobalCommandLauncherLabels;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onEscapeKeyDown: (event: globalThis.KeyboardEvent) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (query: string) => void;
  onTabChange: (tab: CommandLauncherTab) => void;
  onValueChange: (value: string) => void;
  query: string;
  status: ReactNode;
  value: string;
  workspaceLabel?: string | null;
}) {
  const hasScopes = availableTabs.length > 1;
  return (
    <DialogContent
      aria-label={labels.title}
      className={COMMAND_CENTER_CONTENT_CLASS_NAME}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      showCloseButton={false}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>{labels.searchHint}</DialogDescription>
      </DialogHeader>
      <Command
        className="flex h-full min-h-0 flex-col rounded-none border-none bg-transparent"
        loop
        onValueChange={onValueChange}
        shouldFilter={false}
        value={value}
      >
        <div className="flex h-13 shrink-0 items-center gap-2.5 border-b px-3.5 [&_[data-slot=command-input-wrapper]]:h-full [&_[data-slot=command-input-wrapper]]:min-w-0 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:px-0">
          <CommandInput
            aria-label={labels.title}
            autoFocus
            className="h-10 flex-1 border-0 px-0 text-[15px] shadow-none focus-visible:ring-0"
            onKeyDown={onInputKeyDown}
            onValueChange={onQueryChange}
            placeholder={labels.placeholder}
            value={query}
          />
          <span className="hidden h-6.5 max-w-50 items-center gap-1.5 truncate rounded-md border px-2 text-muted-foreground text-xs sm:inline-flex">
            <span className="truncate font-medium text-foreground">
              {appLabel}
            </span>
            {workspaceLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{workspaceLabel}</span>
              </>
            ) : null}
          </span>
          <kbd className="hidden rounded-md border bg-background px-1.5 py-1 font-mono text-[10px] text-muted-foreground shadow-xs sm:block">
            Esc
          </kbd>
          <Button
            aria-label={labels.close}
            className="size-8 sm:hidden"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        {hasScopes ? (
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

        <div
          className={cn(
            'relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]',
            actionsPanel && 'sm:grid-cols-[minmax(0,1fr)_220px]'
          )}
        >
          <CommandList className="max-h-none min-h-0 flex-1 scroll-py-2 overflow-y-auto overscroll-contain p-1.5 [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-popover">
            {children}
          </CommandList>
          {actionsPanel}
        </div>

        <div className="flex h-9.5 shrink-0 items-center gap-3.5 overflow-hidden border-t bg-muted/20 px-3 text-[11px] text-muted-foreground">
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <Hint keys="↑↓" label={labels.navigate} />
            <Hint keys="↵" label={labels.select} />
            <Hint keys="→" label={labels.itemActions} />
            {hasScopes ? <Hint keys="Tab" label={labels.scope} /> : null}
            <Hint keys="Esc" label={labels.close} />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {status ?? (
              <span className="hidden truncate md:block">
                {labels.searchHint}
              </span>
            )}
          </div>
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
