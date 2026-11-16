'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  COMMAND_LAUNCHER_TABS,
  COMMAND_LAUNCHER_TABS_WITHOUT_TASKS,
  type CommandLauncherTab,
  parseLauncherQuery,
} from './command-launcher-tabs';
import type {
  CommandCenterMode,
  CommandCenterOpenOptions,
} from './command-launcher-types';

/**
 * Query, scope, mode and item-actions state for one open session. Scopes a
 * host does not serve are never offered; a typed prefix routes to its scope
 * without changing the chosen tab.
 */
export function useCommandCenterScope({
  defaultTab,
  enableTasks,
  hasExtraSections,
  hasNavItems,
  options,
}: {
  defaultTab: CommandLauncherTab;
  enableTasks: boolean;
  hasExtraSections: boolean;
  hasNavItems: boolean;
  options: CommandCenterOpenOptions;
}) {
  const hostTabs: readonly CommandLauncherTab[] = enableTasks
    ? COMMAND_LAUNCHER_TABS
    : hasExtraSections
      ? COMMAND_LAUNCHER_TABS_WITHOUT_TASKS
      : ['all'];
  const availableTabs = hostTabs.filter(
    (tab) => tab !== 'navigation' || hasNavItems
  );
  const resolvedDefaultTab = availableTabs.includes(defaultTab)
    ? defaultTab
    : 'all';
  const [query, setQueryState] = useState(options.query ?? '');
  const [activeTab, setActiveTab] = useState<CommandLauncherTab>(
    options.scope && availableTabs.includes(options.scope)
      ? options.scope
      : resolvedDefaultTab
  );
  const [mode, setMode] = useState<CommandCenterMode>(
    options.mode ?? 'default'
  );
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [actionIndex, setActionIndex] = useState(0);

  const parsedQuery = useMemo(() => parseLauncherQuery(query), [query]);
  const prefixedTab =
    parsedQuery.tab && availableTabs.includes(parsedQuery.tab)
      ? parsedQuery.tab
      : null;
  const routedTab = prefixedTab ?? activeTab;

  const setQuery = useCallback((next: string) => {
    setActionsFor(null);
    setQueryState(next);
  }, []);
  const changeTab = useCallback(
    (tab: CommandLauncherTab) => {
      setActionsFor(null);
      setActiveTab(tab);
      if (tab !== 'actions') setMode('default');
      if (parsedQuery.tab) setQueryState(parsedQuery.query);
    },
    [parsedQuery]
  );

  return {
    actionIndex,
    actionsFor,
    activeTab,
    availableTabs,
    changeTab,
    mode,
    parsedQuery,
    query,
    resolvedDefaultTab,
    routedTab,
    setActionIndex,
    setActionsFor,
    setQuery,
    trimmedQuery: parsedQuery.query.trim(),
  };
}
