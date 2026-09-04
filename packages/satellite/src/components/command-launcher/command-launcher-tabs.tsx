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
  { icon: ListTodo, key: 'tasks' },
  { icon: Search, key: 'all' },
  { icon: Compass, key: 'navigation' },
  { icon: Boxes, key: 'apps' },
  { icon: Sparkles, key: 'actions' },
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
  availableTabs = COMMAND_LAUNCHER_TABS,
  labels,
  onChange,
}: {
  activeTab: CommandLauncherTab;
  ariaLabel: string;
  availableTabs?: readonly CommandLauncherTab[];
  labels: Record<CommandLauncherTab, string>;
  onChange: (tab: CommandLauncherTab) => void;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="m-0 flex min-w-0 gap-1 overflow-x-auto border-0 border-b bg-muted/20 px-3 pt-2"
    >
      {TAB_DEFINITIONS.filter(({ key }) => availableTabs.includes(key)).map(
        ({ icon: Icon, key }, index) => {
          const selected = activeTab === key;
          return (
            <Button
              aria-pressed={selected}
              className={cn(
                'h-9 shrink-0 gap-2 rounded-b-none border-transparent px-3 text-muted-foreground',
                selected &&
                  'border-border border-b-background bg-background text-foreground shadow-xs'
              )}
              key={key}
              onClick={() => onChange(key)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon className="size-4" />
              {labels[key]}
              <span className="hidden font-mono text-[10px] opacity-50 sm:inline">
                {index + 1}
              </span>
            </Button>
          );
        }
      )}
    </fieldset>
  );
}

export const COMMAND_LAUNCHER_TABS: readonly CommandLauncherTab[] =
  TAB_DEFINITIONS.map((definition) => definition.key);

export const COMMAND_LAUNCHER_TABS_WITHOUT_TASKS: readonly CommandLauncherTab[] =
  COMMAND_LAUNCHER_TABS.filter((tab) => tab !== 'tasks');
