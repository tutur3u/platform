'use client';

import type {
  QuickCommandCenterGroup,
  QuickCommandCenterItem,
} from '@tuturuuu/ui/quick-command-center';
import { CommandGroup, CommandItem, CommandShortcut } from '../../command';

export function matchesFinanceCommand(
  item: Pick<
    QuickCommandCenterItem,
    'description' | 'keywords' | 'shortcut' | 'title'
  >,
  query: string
) {
  if (!query) return true;
  return [item.title, item.description, item.shortcut, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query.toLowerCase());
}

export function digitShortcutFor(index: number) {
  if (index < 0 || index > 9) return null;
  return index === 9 ? '0' : String(index + 1);
}

/** Finance groups rendered as rows of the shared command center list. */
export function FinanceCommandGroupList({
  digitShortcuts = false,
  groups,
  query = '',
}: {
  digitShortcuts?: boolean;
  groups: QuickCommandCenterGroup[];
  query?: string;
}) {
  let index = -1;
  return groups.map((group) => {
    const items = group.items.filter((item) =>
      matchesFinanceCommand(item, query)
    );
    if (items.length === 0) return null;
    return (
      <CommandGroup heading={group.heading} key={group.id}>
        {items.map((item) => {
          index += 1;
          const shortcut = digitShortcuts
            ? digitShortcutFor(index)
            : (item.shortcut ?? null);
          return (
            <CommandItem
              className="min-h-11 gap-2.5 rounded-lg px-2.5"
              disabled={item.disabled}
              key={item.id}
              onSelect={() => {
                if (!item.disabled) item.onSelect();
              }}
              value={`finance-${group.id}-${item.id}`}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.title}</span>
                {item.description ? (
                  <span className="block truncate text-muted-foreground text-xs">
                    {item.description}
                  </span>
                ) : null}
              </span>
              {shortcut ? <CommandShortcut>{shortcut}</CommandShortcut> : null}
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  });
}
