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
  { icon: ListTodo, key: 'tasks', prefix: '#' },
  { icon: Search, key: 'all', prefix: null },
  { icon: Compass, key: 'navigation', prefix: '/' },
  { icon: Boxes, key: 'apps', prefix: '@' },
  { icon: Sparkles, key: 'actions', prefix: '>' },
] as const;

/** Next scope for Tab (forward) or Shift+Tab (backward), wrapping around. */
export function cycleLauncherTab(
  tabs: readonly CommandLauncherTab[],
  current: CommandLauncherTab,
  direction: 1 | -1
): CommandLauncherTab {
  if (tabs.length === 0) return current;
  const index = tabs.indexOf(current);
  const start = index < 0 ? 0 : index;
  return tabs[(start + direction + tabs.length) % tabs.length] ?? current;
}

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
      className="m-0 flex min-w-0 gap-0.5 overflow-x-auto border-0 border-b px-2 py-1.5 [scrollbar-width:none]"
    >
      {TAB_DEFINITIONS.filter(({ key }) => availableTabs.includes(key)).map(
        ({ icon: Icon, key, prefix }) => {
          const selected = activeTab === key;
          return (
            <Button
              aria-pressed={selected}
              className={cn(
                'h-7 shrink-0 gap-1.5 rounded-md px-2.5 font-normal text-muted-foreground text-[13px]',
                selected && 'bg-accent font-medium text-foreground'
              )}
              key={key}
              onClick={() => onChange(key)}
              size="sm"
              tabIndex={-1}
              type="button"
              variant="ghost"
            >
              <Icon className="size-3.5" />
              {labels[key]}
              {prefix ? (
                <span
                  aria-hidden="true"
                  className="font-mono text-[11px] opacity-60"
                >
                  {prefix}
                </span>
              ) : null}
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
