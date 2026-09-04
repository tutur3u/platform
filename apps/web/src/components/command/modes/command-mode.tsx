'use client';

import { CommandEmpty, CommandInput, CommandList } from '@tuturuuu/ui/command';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import type { NavLink } from '@/components/navigation';
import { CommandActionPanel } from '../action-panel';
import { AddTaskForm } from '../add-task-form';
import {
  CommandCenterEmpty,
  CommandCenterFooter,
  CommandCenterHeader,
} from '../command-center-chrome';
import { CommandSearchControls } from '../command-search-controls';
import { NavigationSection } from '../sections/navigation-section';
import { ProductActionsSection } from '../sections/product-actions-section';
import { QuickActionsSection } from '../sections/quick-actions-section';
import { RecentSection } from '../sections/recent-section';
import { TaskSection } from '../sections/task-section';
import { WorkspaceSection } from '../sections/workspace-section';
import type { CommandAction } from '../utils/command-actions';
import {
  type CommandTab,
  filterAndSortTasks,
  parseCommandQuery,
  type TaskPriorityFilter,
  type TaskSort,
  type TaskStatusFilter,
} from '../utils/command-task-results';
import { addRecentSearch, clearAllRecent } from '../utils/recent-items';
import { useCommandTaskUpdate } from '../utils/use-command-task-update';
import { useNavigationData } from '../utils/use-navigation-data';
import { useTaskSearch } from '../utils/use-task-search';
import { useWorkspaceSearch } from '../utils/use-workspace-search';

interface CommandModeProps {
  navLinks: (NavLink | null)[];
  onClose: () => void;
  wsId: string | null;
}

export function CommandMode({ wsId, navLinks, onClose }: CommandModeProps) {
  const t = useTranslations('command_palette');
  const { modKey } = usePlatform();
  const [query, setQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<CommandTab>(
    wsId ? 'tasks' : 'all'
  );
  const [status, setStatus] = React.useState<TaskStatusFilter>('all');
  const [priority, setPriority] = React.useState<TaskPriorityFilter>('all');
  const [sort, setSort] = React.useState<TaskSort>('relevance');
  const [taskDraft, setTaskDraft] = React.useState<string | null>(null);
  const [recentRefreshKey, setRecentRefreshKey] = React.useState(0);
  const [selectedAction, setSelectedAction] =
    React.useState<CommandAction | null>(null);

  const parsed = React.useMemo(() => parseCommandQuery(query), [query]);
  const routedTab = parsed.tab ?? activeTab;
  const searchQuery = React.useDeferredValue(parsed.query);
  const flattenedNav = useNavigationData(navLinks);
  const showTasks = Boolean(
    wsId && (routedTab === 'tasks' || routedTab === 'all')
  );
  const { tasks, isLoading: isLoadingTasks } = useTaskSearch(
    wsId,
    searchQuery,
    showTasks,
    { priority, sort, status }
  );
  const { workspaces, isLoading: isLoadingWorkspaces } = useWorkspaceSearch(
    routedTab === 'all' || routedTab === 'navigate'
  );
  const currentWorkspace = workspaces.find(
    (workspace) => workspace.id === wsId
  );
  const visibleTasks = React.useMemo(
    () => filterAndSortTasks(tasks, { priority, sort, status }),
    [priority, sort, status, tasks]
  );

  const updateTask = useCommandTaskUpdate(wsId);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const timer = window.setTimeout(() => addRecentSearch(trimmed), 1000);
    return () => window.clearTimeout(timer);
  }, [query]);

  const openTaskForm = React.useCallback(() => {
    if (wsId && parsed.query.trim()) setTaskDraft(parsed.query.trim());
  }, [parsed.query, wsId]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const usesMod = event.metaKey || event.ctrlKey;
    if (usesMod && event.key === 'Enter' && parsed.query.trim() && wsId) {
      event.preventDefault();
      openTaskForm();
      return;
    }
    if (usesMod && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      clearAllRecent();
      setRecentRefreshKey((value) => value + 1);
      return;
    }
    if (usesMod && ['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault();
      const tab = (['tasks', 'all', 'navigate', 'actions'] as const)[
        Number(event.key) - 1
      ];
      if (tab) setActiveTab(tab);
    }
  };

  if (taskDraft && wsId) {
    return (
      <div className="flex h-[82dvh] max-h-185 min-h-120 flex-col">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-sm">
            {t('create_task', { taskName: taskDraft })}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <AddTaskForm
            defaultTaskName={taskDraft}
            setIsLoading={() => {}}
            setOpen={() => setTaskDraft(null)}
            wsId={wsId}
          />
        </div>
      </div>
    );
  }

  if (selectedAction && wsId) {
    return (
      <CommandActionPanel
        action={selectedAction}
        onBack={() => setSelectedAction(null)}
        onClose={onClose}
        wsId={wsId}
      />
    );
  }

  const hasQuery = searchQuery.trim().length > 0;
  const showNavigation = routedTab === 'all' || routedTab === 'navigate';
  const showActions = routedTab === 'all' || routedTab === 'actions';

  return (
    <div className="command-center-surface flex h-[82dvh] max-h-185 min-h-120 flex-col">
      <CommandCenterHeader
        modKey={modKey}
        workspaceName={currentWorkspace?.name}
      />
      <CommandInput
        autoFocus
        className="h-14 border-none text-base"
        onKeyDown={handleInputKeyDown}
        onValueChange={setQuery}
        placeholder={t('search_placeholder_power')}
        value={query}
      />
      <CommandSearchControls
        activeTab={routedTab}
        onPriorityChange={setPriority}
        onSortChange={setSort}
        onStatusChange={setStatus}
        onTabChange={setActiveTab}
        priority={priority}
        sort={sort}
        status={status}
        taskCount={visibleTasks.length}
      />

      <CommandList className="max-h-none min-h-0 flex-1 scroll-py-2 px-1 py-1">
        <CommandEmpty>
          <CommandCenterEmpty
            canCreateTask={Boolean(
              wsId && (routedTab === 'tasks' || routedTab === 'all')
            )}
            onCreateTask={openTaskForm}
            query={parsed.query}
          />
        </CommandEmpty>

        {!hasQuery && routedTab === 'all' ? (
          <RecentSection
            key={recentRefreshKey}
            onApplySearch={setQuery}
            onSelect={onClose}
            query={searchQuery}
          />
        ) : null}

        {showTasks && wsId ? (
          <TaskSection
            busyTaskId={updateTask.isPending ? updateTask.variables?.id : null}
            isLoading={isLoadingTasks}
            onSelect={onClose}
            onToggleComplete={(task) => updateTask.mutate(task)}
            query={searchQuery}
            tasks={visibleTasks}
            workspaceName={currentWorkspace?.name}
            wsId={wsId}
          />
        ) : null}

        {showActions ? (
          <>
            <QuickActionsSection onSelect={onClose} query={searchQuery} />
            <ProductActionsSection
              navItems={flattenedNav}
              onOpenAction={setSelectedAction}
              onSelect={onClose}
              query={searchQuery}
            />
          </>
        ) : null}

        {showNavigation ? (
          <>
            <WorkspaceSection
              isLoading={isLoadingWorkspaces}
              onSelect={onClose}
              query={searchQuery}
              workspaces={workspaces}
            />
            <NavigationSection
              navItems={flattenedNav}
              onSelect={onClose}
              query={searchQuery}
            />
          </>
        ) : null}
      </CommandList>
      <CommandCenterFooter modKey={modKey} />
    </div>
  );
}
