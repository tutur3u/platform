'use client';

import type { CommandLauncherTab } from '@tuturuuu/satellite/command-launcher';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { NavLink } from '@/components/navigation';
import { ProductActionsSection } from './sections/product-actions-section';
import { QuickActionsSection } from './sections/quick-actions-section';
import { RecentSection } from './sections/recent-section';
import { TaskSection } from './sections/task-section';
import { TaskSearchToolbar } from './task-search-toolbar';
import type { CommandAction } from './utils/command-actions';
import {
  filterAndSortTasks,
  type TaskPriorityFilter,
  type TaskSort,
  type TaskStatusFilter,
} from './utils/command-task-results';
import { useCommandTaskUpdate } from './utils/use-command-task-update';
import { useNavigationData } from './utils/use-navigation-data';
import { useTaskSearch } from './utils/use-task-search';

export function PlatformCommandExtraSections({
  activeTab,
  navLinks,
  onClose,
  onApplySearch,
  query,
  workspaceId,
  workspaceName,
}: {
  activeTab: CommandLauncherTab;
  navLinks: (NavLink | null)[];
  onApplySearch: (query: string) => void;
  onClose: () => void;
  query: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [priority, setPriority] = useState<TaskPriorityFilter>('all');
  const [sort, setSort] = useState<TaskSort>('relevance');
  const flattenedNav = useNavigationData(navLinks);
  const { isLoading: isLoadingTasks, tasks } = useTaskSearch(
    workspaceId ?? null,
    query,
    Boolean(workspaceId && (activeTab === 'tasks' || activeTab === 'all')),
    { priority, sort, status }
  );
  const visibleTasks = useMemo(
    () => filterAndSortTasks(tasks, { priority, sort, status }),
    [priority, sort, status, tasks]
  );
  const updateTask = useCommandTaskUpdate(workspaceId ?? null);

  const handleOpenAction = (action: CommandAction) => {
    router.push(action.targetHref);
    onClose();
  };

  return (
    <>
      {(activeTab === 'tasks' || activeTab === 'all') && workspaceId ? (
        <TaskSearchToolbar
          onPriorityChange={setPriority}
          onSortChange={setSort}
          onStatusChange={setStatus}
          priority={priority}
          sort={sort}
          status={status}
        />
      ) : null}
      {activeTab === 'all' || activeTab === 'tasks' ? (
        workspaceId ? (
          <TaskSection
            busyTaskId={updateTask.isPending ? updateTask.variables?.id : null}
            isLoading={isLoadingTasks}
            onSelect={onClose}
            onToggleComplete={(task) => updateTask.mutate(task)}
            query={query}
            tasks={visibleTasks}
            workspaceName={workspaceName ?? undefined}
            wsId={workspaceId}
          />
        ) : null
      ) : null}
      {!query.trim() && activeTab === 'all' && (
        <RecentSection
          query={query}
          onApplySearch={onApplySearch}
          onSelect={onClose}
        />
      )}
      {activeTab === 'all' || activeTab === 'actions' ? (
        <>
          <QuickActionsSection query={query} onSelect={onClose} />
          <ProductActionsSection
            navItems={flattenedNav}
            onOpenAction={handleOpenAction}
            onSelect={onClose}
            query={query}
          />
        </>
      ) : null}
    </>
  );
}
