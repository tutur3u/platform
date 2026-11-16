'use client';

import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { type RefObject, useMemo, useState } from 'react';
import { CommandCenterFallbackSection } from './command-center-fallback-section';
import {
  CommandCenterRecentSection,
  useCommandCenterRecents,
} from './command-center-recent-section';
import { CommandCenterStatus } from './command-center-status';
import { CommandLauncherChrome } from './command-launcher-chrome';
import { CommandLauncherItemActions } from './command-launcher-item-actions';
import { CommandLauncherResults } from './command-launcher-results';
import {
  type CommandCenterOpenOptions,
  DEFAULT_LABELS,
  type GlobalCommandLauncherProps,
} from './command-launcher-types';
import { isWorkspaceCurrent } from './command-launcher-utils';
import { useCommandCenterKeys } from './use-command-center-keys';
import { useCommandCenterNavigation } from './use-command-center-navigation';
import { useCommandCenterScope } from './use-command-center-scope';
import { useCommandLauncherResults } from './use-command-launcher-results';
import { useOnlineStatus } from './use-online-status';

const NO_RESULTS: never[] = [];

type SessionProps = Omit<GlobalCommandLauncherProps, 'instancePriority'> & {
  onClose: () => void;
  open: boolean;
  options: CommandCenterOpenOptions;
  pathname: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
};

export function CommandCenterSession({
  currentApp,
  currentWorkspaceId,
  defaultTab = 'all',
  enableTasks = false,
  extraSections,
  fallbackActions,
  labels: labelOverrides,
  navItems = [],
  onClose,
  onNavigate,
  open,
  options,
  pathname,
  returnFocusRef,
  showRecent = true,
  workspacePathResolver,
}: SessionProps) {
  const labels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides]
  );
  const {
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
    trimmedQuery,
  } = useCommandCenterScope({
    defaultTab,
    enableTasks,
    hasExtraSections: Boolean(extraSections),
    hasNavItems: navItems.length > 0,
    options,
  });
  const [selectedValue, setSelectedValue] = useState('');
  const isOnline = useOnlineStatus();
  const showApps = routedTab === 'all' || routedTab === 'apps';
  const showNavigation = routedTab === 'all' || routedTab === 'navigation';
  const showExtraSections =
    routedTab === 'tasks' || routedTab === 'all' || routedTab === 'actions';

  const results = useCommandLauncherResults({
    currentWorkspaceId,
    navItems,
    open,
    pathname,
    query: trimmedQuery,
    showApps,
  });
  const recents = useCommandCenterRecents({
    actorId: results.actorId,
    enabled: showRecent && open && !trimmedQuery && routedTab === 'all',
    navItems,
    workspaces: results.searchableWorkspaces,
  });
  const showFallback =
    Boolean(results.actorId) &&
    (routedTab === 'all' || routedTab === 'actions');
  const {
    entries,
    fallbackItems,
    openApp,
    openNavItem,
    openRecent,
    openWorkspace,
  } = useCommandCenterNavigation({
      actorId: results.actorId,
      appResults: showApps ? results.appResults : NO_RESULTS,
      currentApp,
      currentWorkspace: results.currentWorkspace,
      fallbackActions: showFallback ? (fallbackActions ?? {}) : null,
      labels,
      navigationResults: showNavigation
        ? results.navigationResults
        : NO_RESULTS,
      onClose,
      onNavigate,
      query: trimmedQuery,
      recents,
      workspacePathResolver,
      workspaceResults: showApps ? results.workspaceResults : NO_RESULTS,
    });
  const selectedEntry = entries.get(selectedValue);
  const actionEntry = actionsFor ? entries.get(actionsFor) : undefined;

  const handleInputKeyDown = useCommandCenterKeys({
    actionEntry,
    actionIndex,
    activeTab,
    availableTabs,
    changeTab,
    defaultTab: resolvedDefaultTab,
    query,
    routedTab,
    selectedEntry,
    selectedValue,
    setActionIndex,
    setActionsFor,
  });

  const extraSectionContext = {
    activeTab: routedTab,
    isOpen: open,
    labels,
    mode,
    onClose,
    query: parsedQuery.query,
    setQuery,
  };
  const renderedExtraSections =
    typeof extraSections === 'function'
      ? extraSections(extraSectionContext)
      : extraSections;
  const currentAppTitle =
    LAUNCHABLE_APPS.find((app) => app.slug === currentApp)?.title ??
    labels.title;
  const status =
    !isOnline || results.isSearchingWorkspaces ? (
      <CommandCenterStatus
        isOffline={!isOnline}
        isSearching={results.isSearchingWorkspaces}
        labels={labels}
      />
    ) : null;

  return (
    <CommandLauncherChrome
      actionsPanel={
        actionEntry ? (
          <CommandLauncherItemActions
            actions={actionEntry.actions}
            activeIndex={actionIndex}
            backLabel={labels.back}
            onRun={(action) => action.run()}
            title={actionEntry.title}
          />
        ) : null
      }
      activeTab={routedTab}
      appLabel={currentAppTitle}
      availableTabs={availableTabs}
      labels={labels}
      onClose={onClose}
      onCloseAutoFocus={(event) => {
        const target = returnFocusRef.current;
        if (!target?.isConnected) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
      }}
      onEscapeKeyDown={(event) => {
        // Esc unwinds one layer at a time: item actions, then the query,
        // then the dialog.
        if (actionEntry) {
          event.preventDefault();
          setActionsFor(null);
        } else if (query) {
          event.preventDefault();
          setQuery('');
        }
      }}
      onInputKeyDown={handleInputKeyDown}
      onQueryChange={setQuery}
      onTabChange={changeTab}
      onValueChange={setSelectedValue}
      query={query}
      status={status}
      value={selectedValue}
      workspaceLabel={results.currentWorkspace?.name}
    >
      <CommandLauncherResults
        appResults={results.appResults}
        currentApp={currentApp}
        currentWorkspaceId={currentWorkspaceId}
        extraSections={
          <>
            {showExtraSections ? renderedExtraSections : null}
            <CommandCenterRecentSection
              currentApp={currentApp}
              isCurrentWorkspace={(workspace) =>
                isWorkspaceCurrent(workspace, currentWorkspaceId, pathname)
              }
              labels={labels}
              onOpen={(recent) => openRecent(recent)}
              recents={recents}
            />
          </>
        }
        fallbackSection={
          <CommandCenterFallbackSection
            items={fallbackItems}
            labels={labels}
            query={trimmedQuery}
          />
        }
        isLoadingWorkspaces={results.isLoadingWorkspaces}
        isOffline={!isOnline}
        isSearchingWorkspaces={results.isSearchingWorkspaces}
        labels={labels}
        navigationResults={results.navigationResults}
        onOpenApp={(app) => openApp(app)}
        onOpenNavigation={(item) => openNavItem(item)}
        onOpenWorkspace={(workspace) => openWorkspace(workspace)}
        onRetryWorkspaces={results.retryWorkspaces}
        pathname={pathname}
        query={trimmedQuery}
        showApps={showApps}
        showNavigation={showNavigation}
        workspaceError={results.workspaceError}
        workspaceResults={results.workspaceResults}
      />
    </CommandLauncherChrome>
  );
}
