'use client';

import { ArrowRight, Search } from '@tuturuuu/icons';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import type { ReactNode } from 'react';
import type { GlobalCommandLauncherLabels } from './command-launcher-types';

export type CommandCenterFallbackItem = {
  description: string;
  icon: ReactNode;
  id: 'ask-mira' | 'create-task';
  onSelect: () => void;
  title: string;
  value: string;
};

/**
 * Follow-ups that carry the typed query into an existing composer as an
 * editable draft. The no-match note hides itself (CSS `:has`)
 * while any other result row is in the list, so it reads as an empty state
 * only when the follow-ups are all that is left.
 */
export function CommandCenterFallbackSection({
  items,
  labels,
  query,
}: {
  items: readonly CommandCenterFallbackItem[];
  labels: GlobalCommandLauncherLabels;
  query: string;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <div
        className="flex flex-col items-center gap-2 px-6 pt-8 pb-3 text-center [[cmdk-list-sizer]:has([cmdk-item]:not([data-command-fallback]))_&]:hidden"
        data-command-empty-note=""
      >
        <Search className="size-5 text-muted-foreground" />
        <p className="font-medium">{labels.empty}</p>
        <p className="max-w-full truncate text-muted-foreground text-sm">
          “{query}”
        </p>
      </div>
      <CommandGroup heading={labels.suggestions}>
        {items.map((item) => (
          <CommandItem
            className="group/row min-h-11 gap-2.5 rounded-lg px-2.5 py-1.5 data-[selected=true]:bg-accent"
            data-command-fallback=""
            key={item.id}
            onSelect={item.onSelect}
            value={item.value}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground group-data-[selected=true]/row:text-foreground">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                <span className="font-medium">{item.title}</span>{' '}
                <span className="text-muted-foreground">“{query}”</span>
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {item.description}
              </span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground opacity-0 group-data-[selected=true]/row:opacity-100" />
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
