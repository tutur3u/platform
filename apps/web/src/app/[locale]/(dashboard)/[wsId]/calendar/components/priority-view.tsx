'use client';

import { ExtendedWorkspaceTask } from '../../time-tracker/types';
import ActionsDropdown from './actions-dropdown';
import PriorityDropdown from './priority-dropdown';
import { getAssignedTasks } from './task-fetcher';
import {
  Calendar,
  CheckCircle2,
  Loader2,
  Search,
  Timer,
} from '@tuturuuu/ui/icons';
import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export const TASK_PRIORITIES = {
  low: {
    emoji: '😊',
    label: 'Low',
    textColor: 'text-green-600',
    color:
      'from-green-500/20 to-green-600/20 border-green-200 dark:border-green-800',
  },
  normal: {
    emoji: '😐',
    label: 'Normal',
    textColor: 'text-blue-600',
    color:
      'from-blue-500/20 to-blue-600/20 border-blue-200 dark:border-blue-800',
  },
  high: {
    emoji: '😠',
    label: 'High',
    textColor: 'text-orange-600',
    color:
      'from-orange-500/20 to-orange-600/20 border-orange-200 dark:border-orange-800',
  },
  critical: {
    emoji: '😡',
    label: 'Critical',
    textColor: 'text-red-600',
    color: 'from-red-500/20 to-red-600/20 border-red-200 dark:border-red-800',
  },
} as const;

export type TaskPriority = keyof typeof TASK_PRIORITIES;

export default function PriorityView({
  allTasks,
  assigneeId,
}: {
  allTasks: ExtendedWorkspaceTask[];
  assigneeId: string;
}) {
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<ExtendedWorkspaceTask[]>(
    []
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounced search function
  const debouncedSearch = useDebouncedCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await getAssignedTasks(assigneeId, searchQuery.trim());
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching tasks:', error);
      setSearchError('Failed to search tasks');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, 500);

  // Use search results when searching, otherwise use all tasks
  const combinedTasks = search.trim() ? searchResults : allTasks;

  // Group tasks by priority
  const grouped: { [key: string]: ExtendedWorkspaceTask[] } = {
    low: [],
    normal: [],
    high: [],
    critical: [],
  };

  combinedTasks.forEach((task) => {
    const priority = task.user_defined_priority || 'normal';
    if (grouped[priority]) {
      grouped[priority].push(task);
    } else {
      grouped.normal?.push(task);
    }
  });

  const handlePriorityChange = async (taskId: string, newPriority: string) => {
    // TODO: Implement API call to update task priority
    console.log('Updating task priority:', taskId, newPriority);
    // This would typically make an API call to update the task
    // await updateTaskPriority(taskId, newPriority);
  };

  const handleEdit = (taskId: string) => {
    // TODO: Implement edit functionality
    console.log('Editing task:', taskId);
  };

  const handleViewDetails = (taskId: string) => {
    // TODO: Implement view details functionality
    console.log('Viewing details for task:', taskId);
  };

  const handleDueDate = (taskId: string) => {
    // TODO: Implement due date functionality
    console.log('Setting due date for task:', taskId);
  };

  const handleAddTime = (taskId: string) => {
    // TODO: Implement add time functionality
    console.log('Adding time to task:', taskId);
  };

  const handleLogWork = (taskId: string) => {
    // TODO: Implement log work functionality
    console.log('Logging work for task:', taskId);
  };

  const handleMarkDone = (taskId: string) => {
    // TODO: Implement mark done functionality
    console.log('Marking task as done:', taskId);
  };

  const handleDelete = (taskId: string) => {
    // TODO: Implement delete functionality
    console.log('Deleting task:', taskId);
  };

  return (
    <div className="space-y-4">
      {/* Enhanced Search */}
      <div className="relative mb-6">
        <div
          className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
            isSearchFocused
              ? 'border-blue-400 bg-background shadow-lg ring-2 ring-blue-400/20'
              : 'border-border bg-background/50 hover:bg-background/80'
          }`}
        >
          <div className="flex items-center">
            {isSearching ? (
              <Loader2 className="ml-3 h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <Search
                className={`ml-3 h-4 w-4 transition-colors duration-200 ${
                  isSearchFocused ? 'text-blue-500' : 'text-muted-foreground'
                }`}
              />
            )}
            <input
              className="w-full bg-transparent px-3 py-3 text-sm placeholder-muted-foreground outline-none"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                debouncedSearch(e.target.value);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </div>
          {isSearchFocused && (
            <div className="absolute inset-0 -z-10 animate-pulse bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
          )}
        </div>
        {searchError && (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {searchError}
          </div>
        )}
      </div>

      {/* Priority Groups */}
      <div className="space-y-4">
        {Object.entries(TASK_PRIORITIES).map(([key, priority], index) => {
          const tasks = grouped[key] || [];
          const colorClasses = priority.color;
          const icon = priority.emoji;
          const label = priority.label;

          return (
            <div
              key={key}
              className="group duration-300 animate-in slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <h3 className="font-semibold text-foreground">{label}</h3>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 group-hover:bg-accent">
                  {tasks.length}
                </span>
              </div>

              {tasks.length > 0 ? (
                <div
                  className={`overflow-hidden rounded-xl border bg-gradient-to-br ${colorClasses} shadow-sm transition-all duration-300 hover:shadow-md`}
                >
                  <div className="bg-background/80 p-4 backdrop-blur-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold">Tasks</div>
                      <Timer className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="space-y-2">
                      {tasks.map((task, taskIndex) => (
                        <div
                          key={task.id}
                          className="group/task relative overflow-hidden rounded-lg border border-border/50 bg-background/60 p-3 transition-all duration-200 hover:border-border hover:bg-background/80 hover:shadow-sm"
                          style={{ animationDelay: `${taskIndex * 50}ms` }}
                        >
                          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-accent/5 to-accent/10 opacity-0 transition-opacity duration-200 group-hover/task:opacity-100" />
                          <div className="flex h-full min-h-[64px] flex-col">
                            <div className="flex w-full items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-foreground transition-colors duration-200 group-hover/task:text-blue-600">
                                  {task.name || (
                                    <span className="text-muted-foreground italic">
                                      Untitled task
                                    </span>
                                  )}
                                </div>
                                {/* Due date (if present) */}
                                {task.due_date && (
                                  <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    <Calendar className="h-3 w-3" />
                                    Due {formatDueDate(task.due_date)}
                                  </div>
                                )}
                              </div>
                              {/* Top right icons */}
                              <div className="ml-3 flex items-center gap-2">
                                <PriorityDropdown
                                  taskId={task.id}
                                  currentPriority={
                                    task.user_defined_priority || 'normal'
                                  }
                                  allPriorities={TASK_PRIORITIES}
                                  onPriorityChange={handlePriorityChange}
                                />
                                <ActionsDropdown
                                  taskId={task.id}
                                  onEdit={handleEdit}
                                  onViewDetails={handleViewDetails}
                                  onDueDate={handleDueDate}
                                  onAddTime={handleAddTime}
                                  onLogWork={handleLogWork}
                                  onMarkDone={handleMarkDone}
                                  onDelete={handleDelete}
                                />
                              </div>
                            </div>
                            {/* Bottom row: Ready left, time right */}
                            <div className="mt-2 flex items-center justify-between">
                              <div className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Ready
                              </div>
                              {task.total_duration && (
                                <div className="rounded-md bg-accent/50 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 group-hover/task:bg-accent">
                                  {Math.floor(task.total_duration || 0)}h{' '}
                                  {((task.total_duration || 0) * 60) % 60}m
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 p-6 text-center transition-all duration-200 hover:border-border">
                  <div className="text-sm text-muted-foreground">
                    No tasks found
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDueDate(date: string | Date) {
  // expects date as string or Date, returns MM/DD or DD/MM as you prefer
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
