'use client';

import { Plus, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@tuturuuu/ui/command';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import * as React from 'react';
import type { NavLink } from '@/components/navigation';
import { AddTaskForm } from '../add-task-form';
import { NavigationSection } from '../sections/navigation-section';
import { QuickActionsSection } from '../sections/quick-actions-section';
import { RecentSection } from '../sections/recent-section';
import { TaskSection } from '../sections/task-section';
import { WorkspaceSection } from '../sections/workspace-section';
import { addRecentSearch, clearAllRecent } from '../utils/recent-items';
import { useNavigationData } from '../utils/use-navigation-data';
import { useTaskSearch } from '../utils/use-task-search';
import { useWorkspaceSearch } from '../utils/use-workspace-search';

interface CommandModeProps {
  wsId: string | null;
  navLinks: (NavLink | null)[];
  onClose: () => void;
}

export function CommandMode({ wsId, navLinks, onClose }: CommandModeProps) {
  const [query, setQuery] = React.useState('');
  const [showTaskForm, setShowTaskForm] = React.useState(false);
  const [defaultTaskName, setDefaultTaskName] = React.useState('');
  const [recentRefreshKey, setRecentRefreshKey] = React.useState(0);
  const { modKey } = usePlatform();

  // Prepare navigation data
  const flattenedNav = useNavigationData(navLinks);

  // Search tasks
  const { tasks, isLoading: isLoadingTasks } = useTaskSearch(
    wsId,
    query,
    true // enabled
  );

  // Fetch workspaces
  const { workspaces, isLoading: isLoadingWorkspaces } = useWorkspaceSearch(
    true // enabled
  );

  // Get current workspace name for context
  const currentWorkspace = React.useMemo(
    () => workspaces.find((ws) => ws.id === wsId),
    [workspaces, wsId]
  );

  // Track search queries
  const prevQueryRef = React.useRef('');
  React.useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery && trimmedQuery !== prevQueryRef.current) {
      // Debounce adding to recent searches
      const timer = setTimeout(() => {
        addRecentSearch(trimmedQuery);
        prevQueryRef.current = trimmedQuery;
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [query]);

  // Handle quick task creation
  const handleCreateTask = React.useCallback(
    (taskName: string) => {
      if (!wsId) return;
      setDefaultTaskName(taskName);
      setShowTaskForm(true);
    },
    [wsId]
  );

  // Handle keyboard shortcuts at input level
  const handleInputKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Ctrl+X to clear recent items (no confirmation)
      if (e.key === 'x' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        clearAllRecent();
        setRecentRefreshKey((prev) => prev + 1);
        return;
      }
      // Ctrl+Enter to quickly create task from query
      if (
        e.key === 'Enter' &&
        (e.ctrlKey || e.metaKey) &&
        query.trim() &&
        wsId
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleCreateTask(query.trim());
        return;
      }
    },
    [query, wsId, handleCreateTask]
  );

  // Reset to command mode when closing task form
  const handleCloseTaskForm = () => {
    setShowTaskForm(false);
    setDefaultTaskName('');
  };

  // Calculate result counts for display
  const hasQuery = query.trim().length > 0;
  const totalResults =
    flattenedNav.length + (tasks?.length || 0) + (workspaces?.length || 0);

  // Show task form if in task creation mode
  if (showTaskForm && wsId) {
    return (
      <div className="flex h-[70vh] min-h-125 flex-col">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-lg">Create Task</h2>
        </div>
        <div className="flex-1 overflow-auto">
          <AddTaskForm
            wsId={wsId}
            setOpen={handleCloseTaskForm}
            setIsLoading={() => {}}
            defaultTaskName={defaultTaskName}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[70vh] min-h-125 flex-col">
      {/* Header with result count */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Command Center</h2>
            {hasQuery && (
              <p className="text-muted-foreground text-sm">
                {totalResults} result{totalResults !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono opacity-100">
              <span className="text-xs">{modKey}</span>K
            </kbd>
            <span>to toggle</span>
            <span className="text-muted-foreground/50">•</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono opacity-100">
              <span className="text-xs">ESC</span>
            </kbd>
            <span>to close</span>
          </div>
        </div>
      </div>

      {/* Command Interface */}
      <Command className="flex-1 rounded-none border-none" shouldFilter={false}>
        <CommandInput
          placeholder="Search commands, tasks, or navigate..."
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleInputKeyDown}
          className="border-none"
        />

        <CommandList className="max-h-none">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">No results found</p>
                <p className="text-muted-foreground text-sm">
                  {hasQuery ? (
                    <>
                      No matches for "
                      <span className="font-medium">{query}</span>"
                    </>
                  ) : (
                    'Try searching for tasks, pages, or actions'
                  )}
                </p>
              </div>
              {hasQuery && wsId && (
                <Button
                  onClick={() => handleCreateTask(query.trim())}
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create task "{query.trim().slice(0, 30)}
                  {query.trim().length > 30 ? '...' : ''}"
                </Button>
              )}
              {hasQuery && (
                <p className="text-muted-foreground text-xs">
                  Tip: Press{' '}
                  <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                    {modKey}↵
                  </kbd>{' '}
                  to quickly create a task
                </p>
              )}
            </div>
          </CommandEmpty>

          {/* Recent Items (shown when no query) */}
          {!hasQuery && (
            <RecentSection
              key={recentRefreshKey}
              wsId={wsId}
              query={query}
              onSelect={onClose}
              onApplySearch={setQuery}
            />
          )}

          {/* Quick Actions (shown when no query) */}
          <QuickActionsSection query={query} onSelect={onClose} />

          {/* Workspace Results */}
          <WorkspaceSection
            workspaces={workspaces}
            isLoading={isLoadingWorkspaces}
            query={query}
            onSelect={onClose}
          />

          {/* Navigation Results */}
          <NavigationSection
            navItems={flattenedNav}
            query={query}
            onSelect={onClose}
          />

          {/* Task Results */}
          <TaskSection
            tasks={tasks}
            isLoading={isLoadingTasks}
            wsId={wsId}
            workspaceName={currentWorkspace?.name}
            query={query}
            onSelect={onClose}
          />
        </CommandList>
      </Command>

      {/* Footer with hints */}
      <div className="border-t bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-background px-1 font-medium font-mono">
                ↑↓
              </kbd>
              <span>navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-background px-1 font-medium font-mono">
                ↵
              </kbd>
              <span>select</span>
            </div>
            {!hasQuery && (
              <div className="flex items-center gap-1.5">
                <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-background px-1 font-medium font-mono">
                  {modKey}X
                </kbd>
                <span>clear recent</span>
              </div>
            )}
          </div>
          <span className="text-[10px]">Powered by Tuturuuu Search</span>
        </div>
      </div>
    </div>
  );
}
