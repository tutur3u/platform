'use client';

import { Boxes, Compass, ListTodo, Search, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';

export type CommandLauncherTab =
  | 'tasks'
  | 'all'
  | 'navigation'
  | 'apps'
  | 'actions';

const TAB_DEFINITIONS = [
  { icon: ListTodo, key: 'tasks', shortcut: '1' },
  { icon: Search, key: 'all', shortcut: '2' },
  { icon: Compass, key: 'navigation', shortcut: '3' },
  { icon: Boxes, key: 'apps', shortcut: '4' },
  { icon: Sparkles, key: 'actions', shortcut: '5' },
] as const;

export function parseLauncherQuery(query: string): {
  query: string;
  tab: CommandLauncherTab | null;
} {
  const trimmed = query.trimStart();
  const prefix = trimmed[0];
  const tab =
    prefix === '#'
      ? 'tasks'
      : prefix === '/'
        ? 'navigation'
        : prefix === '@'
          ? 'apps'
          : prefix === '>'
            ? 'actions'
            : null;

  return tab
    ? { query: trimmed.slice(1).trimStart(), tab }
    : { query, tab: null };
}

export function CommandLauncherTabs({
  activeTab,
  ariaLabel,
  labels,
  onChange,
}: {
  activeTab: CommandLauncherTab;
  ariaLabel: string;
  labels: Record<CommandLauncherTab, string>;
  onChange: (tab: CommandLauncherTab) => void;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b bg-muted/20 px-3 pt-2"
      role="tablist"
    >
      {TAB_DEFINITIONS.map(({ icon: Icon, key, shortcut }) => {
        const selected = activeTab === key;
        return (
          <Button
            aria-selected={selected}
            className={cn(
              'h-9 shrink-0 gap-2 rounded-b-none border-transparent px-3 text-muted-foreground',
              selected &&
                'border-border border-b-background bg-background text-foreground shadow-xs'
            )}
            key={key}
            onClick={() => onChange(key)}
            role="tab"
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon className="size-4" />
            {labels[key]}
            <span className="hidden font-mono text-[10px] opacity-50 sm:inline">
              {shortcut}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export const COMMAND_LAUNCHER_TABS: readonly CommandLauncherTab[] = [
  'tasks',
  'all',
  'navigation',
  'apps',
  'actions',
];
