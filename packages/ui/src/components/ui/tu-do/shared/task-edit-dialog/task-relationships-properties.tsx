'use client';

import {
  ArrowUpCircle,
  Ban,
  ChevronDown,
  ExternalLink,
  Link2,
  ListTree,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import { useDebouncedValue } from '@tuturuuu/ui/hooks/use-debounce';
import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useWorkspaceTasks } from '@tuturuuu/utils/task-helper';
import * as React from 'react';

interface TaskRelationshipsPropertiesProps {
  wsId: string;
  taskId?: string;
  boardId: string;
  listId?: string;
  isCreateMode: boolean;

  // Data
  parentTask: RelatedTaskInfo | null;
  childTasks: RelatedTaskInfo[];
  blockingTasks: RelatedTaskInfo[];
  blockedByTasks: RelatedTaskInfo[];
  relatedTasks: RelatedTaskInfo[];
  isLoading: boolean;

  // Actions
  onSetParent: (task: RelatedTaskInfo) => void;
  onRemoveParent: () => void;
  onAddBlockingTask: (task: RelatedTaskInfo) => void;
  onRemoveBlockingTask: (taskId: string) => void;
  onAddBlockedByTask: (task: RelatedTaskInfo) => void;
  onRemoveBlockedByTask: (taskId: string) => void;
  onAddRelatedTask: (task: RelatedTaskInfo) => void;
  onRemoveRelatedTask: (taskId: string) => void;

  // Navigation
  onNavigateToTask: (taskId: string) => void;

  // Subtask creation
  onAddSubtask?: () => void;

  // Task creation handlers (create new task + relationship)
  onCreateParent?: (name: string) => Promise<void>;
  onCreateBlockingTask?: (name: string) => Promise<void>;
  onCreateBlockedByTask?: (name: string) => Promise<void>;
  onCreateRelatedTask?: (name: string) => Promise<void>;
  onAddExistingAsSubtask?: (task: RelatedTaskInfo) => Promise<void>;

  // Saving state
  isSaving: boolean;
  savingTaskId?: string | null;
}

export function TaskRelationshipsProperties({
  wsId,
  taskId,
  boardId,
  listId,
  isCreateMode,
  parentTask,
  childTasks,
  blockingTasks,
  blockedByTasks,
  relatedTasks,
  isLoading,
  onSetParent,
  onRemoveParent,
  onAddBlockingTask,
  onRemoveBlockingTask,
  onAddBlockedByTask,
  onRemoveBlockedByTask,
  onAddRelatedTask,
  onRemoveRelatedTask,
  onNavigateToTask,
  onAddSubtask,
  onCreateParent,
  onCreateBlockingTask,
  onCreateBlockedByTask,
  onCreateRelatedTask,
  onAddExistingAsSubtask,
  isSaving,
  savingTaskId,
}: TaskRelationshipsPropertiesProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<
    'parent' | 'subtasks' | 'dependencies' | 'related'
  >('parent');

  // Count totals for summary
  const totalCount =
    (parentTask ? 1 : 0) +
    childTasks.length +
    blockingTasks.length +
    blockedByTasks.length +
    relatedTasks.length;

  const dependencyCount = blockingTasks.length + blockedByTasks.length;

  // Disable in create mode since relationships require existing task
  if (isCreateMode) {
    return null;
  }

  return (
    <div className="border-b bg-muted/20">
      {/* Header with toggle button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/50 md:px-8"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              !isExpanded && '-rotate-90'
            )}
          />
          <span className="shrink-0 font-semibold text-foreground text-sm">
            Relationships
          </span>

          {/* Summary badges when collapsed */}
          {!isExpanded && totalCount > 0 && (
            <div className="ml-2 flex items-center gap-1.5">
              {parentTask && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 font-medium text-[10px] text-dynamic-purple"
                >
                  <ArrowUpCircle className="h-2.5 w-2.5" />
                  Parent
                </Badge>
              )}
              {childTasks.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-green/30 bg-dynamic-green/10 px-2 font-medium text-[10px] text-dynamic-green"
                >
                  <ListTree className="h-2.5 w-2.5" />
                  {childTasks.length}
                </Badge>
              )}
              {dependencyCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-red/30 bg-dynamic-red/10 px-2 font-medium text-[10px] text-dynamic-red"
                >
                  <Ban className="h-2.5 w-2.5" />
                  {dependencyCount}
                </Badge>
              )}
              {relatedTasks.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-blue/30 bg-dynamic-blue/10 px-2 font-medium text-[10px] text-dynamic-blue"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  {relatedTasks.length}
                </Badge>
              )}
            </div>
          )}
        </div>

        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 md:px-8">
          {/* Tab navigation */}
          <div className="mb-3 flex gap-1 overflow-x-auto border-b">
            <TabButton
              active={activeTab === 'parent'}
              onClick={() => setActiveTab('parent')}
              icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
              label="Parent"
              count={parentTask ? 1 : 0}
              color="purple"
            />
            <TabButton
              active={activeTab === 'subtasks'}
              onClick={() => setActiveTab('subtasks')}
              icon={<ListTree className="h-3.5 w-3.5" />}
              label="Sub-tasks"
              count={childTasks.length}
              color="green"
            />
            <TabButton
              active={activeTab === 'dependencies'}
              onClick={() => setActiveTab('dependencies')}
              icon={<Ban className="h-3.5 w-3.5" />}
              label="Dependencies"
              count={dependencyCount}
              color="red"
            />
            <TabButton
              active={activeTab === 'related'}
              onClick={() => setActiveTab('related')}
              icon={<Link2 className="h-3.5 w-3.5" />}
              label="Related"
              count={relatedTasks.length}
              color="blue"
            />
          </div>

          {/* Tab content */}
          <div className="min-h-[120px]">
            {activeTab === 'parent' && (
              <ParentSection
                wsId={wsId}
                taskId={taskId}
                parentTask={parentTask}
                childTaskIds={childTasks.map((t) => t.id)}
                isSaving={isSaving}
                savingTaskId={savingTaskId}
                onSetParent={onSetParent}
                onRemoveParent={onRemoveParent}
                onNavigateToTask={onNavigateToTask}
                onCreateParent={onCreateParent}
              />
            )}

            {activeTab === 'subtasks' && (
              <SubtasksSection
                wsId={wsId}
                taskId={taskId}
                boardId={boardId}
                listId={listId}
                childTasks={childTasks}
                onNavigateToTask={onNavigateToTask}
                onAddSubtask={onAddSubtask}
                onAddExistingAsSubtask={onAddExistingAsSubtask}
                isSaving={isSaving}
              />
            )}

            {activeTab === 'dependencies' && (
              <DependenciesSection
                wsId={wsId}
                taskId={taskId}
                blockingTasks={blockingTasks}
                blockedByTasks={blockedByTasks}
                isSaving={isSaving}
                savingTaskId={savingTaskId}
                onAddBlocking={onAddBlockingTask}
                onRemoveBlocking={onRemoveBlockingTask}
                onAddBlockedBy={onAddBlockedByTask}
                onRemoveBlockedBy={onRemoveBlockedByTask}
                onNavigateToTask={onNavigateToTask}
                onCreateBlockingTask={onCreateBlockingTask}
                onCreateBlockedByTask={onCreateBlockedByTask}
              />
            )}

            {activeTab === 'related' && (
              <RelatedSection
                wsId={wsId}
                taskId={taskId}
                relatedTasks={relatedTasks}
                isSaving={isSaving}
                savingTaskId={savingTaskId}
                onAddRelated={onAddRelatedTask}
                onRemoveRelated={onRemoveRelatedTask}
                onNavigateToTask={onNavigateToTask}
                onCreateRelatedTask={onCreateRelatedTask}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Tab button component
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'purple' | 'green' | 'red' | 'blue';
}) {
  const colorClasses = {
    purple: active
      ? 'border-dynamic-purple text-dynamic-purple'
      : 'text-muted-foreground hover:text-foreground',
    green: active
      ? 'border-dynamic-green text-dynamic-green'
      : 'text-muted-foreground hover:text-foreground',
    red: active
      ? 'border-dynamic-red text-dynamic-red'
      : 'text-muted-foreground hover:text-foreground',
    blue: active
      ? 'border-dynamic-blue text-dynamic-blue'
      : 'text-muted-foreground hover:text-foreground',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium text-xs transition-colors',
        active ? 'border-current' : 'border-transparent',
        colorClasses[color]
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
          {count}
        </span>
      )}
    </button>
  );
}

// Clickable task item component for navigation
function ClickableTaskItem({
  task,
  onNavigateToTask,
  onRemove,
  isSaving,
  isRemoving,
  showRemove = true,
}: {
  task: RelatedTaskInfo;
  onNavigateToTask: (taskId: string) => void;
  onRemove?: () => void;
  isSaving: boolean;
  isRemoving?: boolean;
  showRemove?: boolean;
}) {
  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border bg-background p-2.5 transition-colors hover:bg-muted/50">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onNavigateToTask(task.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            >
              <div
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  task.completed ? 'bg-dynamic-green' : 'bg-muted-foreground/30'
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'truncate text-sm transition-colors group-hover:text-primary',
                    task.completed && 'text-muted-foreground line-through'
                  )}
                >
                  {task.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {task.board_name} #{task.display_number}
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Click to open this task</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {showRemove && onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={isSaving}
        >
          {isRemoving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}

// Parent section with task picker
function ParentSection({
  wsId,
  taskId,
  parentTask,
  childTaskIds,
  isSaving,
  savingTaskId,
  onSetParent,
  onRemoveParent,
  onNavigateToTask,
  onCreateParent,
}: {
  wsId: string;
  taskId?: string;
  parentTask: RelatedTaskInfo | null;
  childTaskIds: string[];
  isSaving: boolean;
  savingTaskId?: string | null;
  onSetParent: (task: RelatedTaskInfo) => void;
  onRemoveParent: () => void;
  onNavigateToTask: (taskId: string) => void;
  onCreateParent?: (name: string) => Promise<void>;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      {parentTask ? (
        <ClickableTaskItem
          task={parentTask}
          onNavigateToTask={onNavigateToTask}
          onRemove={onRemoveParent}
          isSaving={isSaving}
          isRemoving={isSaving && savingTaskId === parentTask.id}
        />
      ) : (
        <TaskSearchPopover
          wsId={wsId}
          excludeTaskIds={taskId ? [taskId, ...childTaskIds] : childTaskIds}
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelect={(task) => {
            onSetParent(task);
            setSearchOpen(false);
          }}
          onCreateNew={
            onCreateParent
              ? async (name) => {
                  await onCreateParent(name);
                  setSearchOpen(false);
                }
              : undefined
          }
          placeholder="Set parent task..."
          emptyText="No available parent tasks"
          isSaving={isSaving}
        />
      )}

      <p className="text-muted-foreground text-xs">
        A parent task groups related work. This task becomes a sub-task of the
        parent.
      </p>
    </div>
  );
}

// Subtasks section with navigation and add subtask functionality
function SubtasksSection({
  wsId,
  taskId,
  boardId,
  listId,
  childTasks,
  onNavigateToTask,
  onAddSubtask,
  onAddExistingAsSubtask,
  isSaving,
}: {
  wsId: string;
  taskId?: string;
  boardId: string;
  listId?: string;
  childTasks: RelatedTaskInfo[];
  onNavigateToTask: (taskId: string) => void;
  onAddSubtask?: () => void;
  onAddExistingAsSubtask?: (task: RelatedTaskInfo) => Promise<void>;
  isSaving: boolean;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  const excludeIds = React.useMemo(() => {
    const ids = taskId ? [taskId] : [];
    childTasks.forEach((t) => ids.push(t.id));
    return ids;
  }, [taskId, childTasks]);

  const hasAddOptions = onAddSubtask || onAddExistingAsSubtask;

  return (
    <div className="space-y-3">
      {/* Empty state */}
      {childTasks.length === 0 && (
        <div className="py-4 text-center">
          <ListTree className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No sub-tasks</p>
          <p className="text-muted-foreground/70 text-xs">
            Add a sub-task to break down this task into smaller pieces
          </p>
        </div>
      )}

      {/* Task list */}
      {childTasks.length > 0 && (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-1">
            {childTasks.map((task) => (
              <ClickableTaskItem
                key={task.id}
                task={task}
                onNavigateToTask={onNavigateToTask}
                isSaving={isSaving}
                showRemove={false}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add buttons */}
      {hasAddOptions && (
        <SubtaskActionButtons
          wsId={wsId}
          excludeIds={excludeIds}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onAddSubtask={onAddSubtask}
          onAddExistingAsSubtask={onAddExistingAsSubtask}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

// Consolidated button component for adding subtasks
function SubtaskActionButtons({
  wsId,
  excludeIds,
  searchOpen,
  onSearchOpenChange,
  onAddSubtask,
  onAddExistingAsSubtask,
  isSaving,
}: {
  wsId: string;
  excludeIds: string[];
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onAddSubtask?: () => void;
  onAddExistingAsSubtask?: (task: RelatedTaskInfo) => Promise<void>;
  isSaving: boolean;
}) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const hasBothOptions = onAddSubtask && onAddExistingAsSubtask;

  if (hasBothOptions) {
    // Dropdown menu with both options + popover content (no separate trigger)
    return (
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange} modal>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between gap-2 text-muted-foreground"
              disabled={isSaving}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-dynamic-purple" />
                Add sub-task
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-full">
            <DropdownMenuItem
              onClick={onAddSubtask}
              disabled={isSaving}
              className="cursor-pointer"
            >
              <Sparkles className="mr-2 h-4 w-4 text-dynamic-purple" />
              <span>Create new sub-task</span>
            </DropdownMenuItem>
            <PopoverTrigger asChild>
              <DropdownMenuItem
                disabled={isSaving}
                className="cursor-pointer"
                onSelect={(e) => e.preventDefault()}
              >
                <Plus className="mr-2 h-4 w-4 text-dynamic-green" />
                <span>Add existing task</span>
              </DropdownMenuItem>
            </PopoverTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Popover content without trigger button */}
        <PopoverContent
          className="z-9999 w-(--radix-popover-trigger-width) p-0"
          align="start"
          sideOffset={4}
        >
          <TaskSearchPopoverContent
            wsId={wsId}
            excludeTaskIds={excludeIds}
            open={searchOpen}
            onOpenChange={onSearchOpenChange}
            onSelect={async (task) => {
              await onAddExistingAsSubtask(task);
              onSearchOpenChange(false);
            }}
            emptyText="No available tasks"
            isSaving={isSaving}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Single option - Create new
  if (onAddSubtask) {
    return (
      <Button
        variant="outline"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={onAddSubtask}
        disabled={isSaving}
      >
        <Sparkles className="h-4 w-4 text-dynamic-purple" />
        Create new sub-task
      </Button>
    );
  }

  // Single option - Add existing
  if (onAddExistingAsSubtask) {
    return (
      <TaskSearchPopover
        wsId={wsId}
        excludeTaskIds={excludeIds}
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
        onSelect={async (task) => {
          await onAddExistingAsSubtask(task);
          onSearchOpenChange(false);
        }}
        placeholder="Add existing task as sub-task..."
        emptyText="No available tasks"
        isSaving={isSaving}
      />
    );
  }

  return null;
}

// Dependencies section with blocking/blocked by
function DependenciesSection({
  wsId,
  taskId,
  blockingTasks,
  blockedByTasks,
  isSaving,
  savingTaskId,
  onAddBlocking,
  onRemoveBlocking,
  onAddBlockedBy,
  onRemoveBlockedBy,
  onNavigateToTask,
  onCreateBlockingTask,
  onCreateBlockedByTask,
}: {
  wsId: string;
  taskId?: string;
  blockingTasks: RelatedTaskInfo[];
  blockedByTasks: RelatedTaskInfo[];
  isSaving: boolean;
  savingTaskId?: string | null;
  onAddBlocking: (task: RelatedTaskInfo) => void;
  onRemoveBlocking: (taskId: string) => void;
  onAddBlockedBy: (task: RelatedTaskInfo) => void;
  onRemoveBlockedBy: (taskId: string) => void;
  onNavigateToTask: (taskId: string) => void;
  onCreateBlockingTask?: (name: string) => Promise<void>;
  onCreateBlockedByTask?: (name: string) => Promise<void>;
}) {
  const [subTab, setSubTab] = React.useState<'blocks' | 'blocked-by'>('blocks');
  const [searchOpen, setSearchOpen] = React.useState(false);

  const allExcludeIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (taskId) ids.add(taskId);
    blockingTasks.forEach((t) => ids.add(t.id));
    blockedByTasks.forEach((t) => ids.add(t.id));
    return Array.from(ids);
  }, [taskId, blockingTasks, blockedByTasks]);

  const currentList = subTab === 'blocks' ? blockingTasks : blockedByTasks;
  const handleAdd = subTab === 'blocks' ? onAddBlocking : onAddBlockedBy;
  const handleRemove =
    subTab === 'blocks' ? onRemoveBlocking : onRemoveBlockedBy;
  const handleCreateNew =
    subTab === 'blocks' ? onCreateBlockingTask : onCreateBlockedByTask;

  return (
    <div className="space-y-3">
      {/* Sub-tab navigation */}
      <div className="flex gap-2">
        <Button
          variant={subTab === 'blocks' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSubTab('blocks')}
          className="h-7 text-xs"
        >
          Blocks ({blockingTasks.length})
        </Button>
        <Button
          variant={subTab === 'blocked-by' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSubTab('blocked-by')}
          className="h-7 text-xs"
        >
          Blocked By ({blockedByTasks.length})
        </Button>
      </div>

      {/* Task list */}
      {currentList.length > 0 && (
        <ScrollArea className="max-h-[150px]">
          <div className="space-y-1">
            {currentList.map((task) => (
              <ClickableTaskItem
                key={task.id}
                task={task}
                onNavigateToTask={onNavigateToTask}
                onRemove={() => handleRemove(task.id)}
                isSaving={isSaving}
                isRemoving={isSaving && savingTaskId === task.id}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add task */}
      <TaskSearchPopover
        wsId={wsId}
        excludeTaskIds={allExcludeIds}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(task) => {
          handleAdd(task);
          setSearchOpen(false);
        }}
        onCreateNew={
          handleCreateNew
            ? async (name) => {
                await handleCreateNew(name);
                setSearchOpen(false);
              }
            : undefined
        }
        placeholder={
          subTab === 'blocks'
            ? 'Add task this blocks...'
            : 'Add blocking task...'
        }
        emptyText="No available tasks"
        isSaving={isSaving}
      />

      <p className="text-muted-foreground text-xs">
        {subTab === 'blocks'
          ? 'Tasks that cannot start until this one is complete.'
          : 'Tasks that must complete before this one can start.'}
      </p>
    </div>
  );
}

// Related tasks section
function RelatedSection({
  wsId,
  taskId,
  relatedTasks,
  isSaving,
  savingTaskId,
  onAddRelated,
  onRemoveRelated,
  onNavigateToTask,
  onCreateRelatedTask,
}: {
  wsId: string;
  taskId?: string;
  relatedTasks: RelatedTaskInfo[];
  isSaving: boolean;
  savingTaskId?: string | null;
  onAddRelated: (task: RelatedTaskInfo) => void;
  onRemoveRelated: (taskId: string) => void;
  onNavigateToTask: (taskId: string) => void;
  onCreateRelatedTask?: (name: string) => Promise<void>;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  const excludeIds = React.useMemo(() => {
    const ids = taskId ? [taskId] : [];
    relatedTasks.forEach((t) => ids.push(t.id));
    return ids;
  }, [taskId, relatedTasks]);

  return (
    <div className="space-y-3">
      {/* Related tasks list */}
      {relatedTasks.length > 0 && (
        <ScrollArea className="max-h-[150px]">
          <div className="space-y-1">
            {relatedTasks.map((task) => (
              <ClickableTaskItem
                key={task.id}
                task={task}
                onNavigateToTask={onNavigateToTask}
                onRemove={() => onRemoveRelated(task.id)}
                isSaving={isSaving}
                isRemoving={isSaving && savingTaskId === task.id}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add related task */}
      <TaskSearchPopover
        wsId={wsId}
        excludeTaskIds={excludeIds}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(task) => {
          onAddRelated(task);
          setSearchOpen(false);
        }}
        onCreateNew={
          onCreateRelatedTask
            ? async (name) => {
                await onCreateRelatedTask(name);
                setSearchOpen(false);
              }
            : undefined
        }
        placeholder="Link related task..."
        emptyText="No available tasks"
        isSaving={isSaving}
      />

      <p className="text-muted-foreground text-xs">
        Link tasks that share context or are related to each other.
      </p>
    </div>
  );
}

// Shared task search popover content (without trigger button)
function TaskSearchPopoverContent({
  wsId,
  excludeTaskIds,
  open,
  onOpenChange,
  onSelect,
  onCreateNew,
  emptyText,
  isSaving,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
}: {
  wsId: string;
  excludeTaskIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (task: RelatedTaskInfo) => void;
  onCreateNew?: (name: string) => Promise<void>;
  emptyText: string;
  isSaving: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}) {
  const [internalSearchQuery, setInternalSearchQuery] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  // Use external query if provided, otherwise use internal
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearchQuery;

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: tasks = [], isLoading: tasksLoading } = useWorkspaceTasks(
    wsId,
    {
      excludeTaskIds,
      searchQuery: debouncedSearch || undefined,
      limit: 30,
      enabled: open,
    }
  );

  // Reset search when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setIsCreating(false);
    }
  }, [open, setSearchQuery]);

  const handleCreateNew = React.useCallback(async () => {
    if (!onCreateNew || !searchQuery.trim() || isCreating) return;

    setIsCreating(true);
    try {
      await onCreateNew(searchQuery.trim());
    } finally {
      setIsCreating(false);
    }
  }, [onCreateNew, searchQuery, isCreating]);

  const showCreateOption = onCreateNew && searchQuery.trim().length > 0;

  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Search tasks..."
        value={searchQuery}
        onValueChange={setSearchQuery}
        className="h-9"
      />
      <CommandList className="max-h-[250px]">
        {tasksLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Create new option at the top when search query exists */}
            {showCreateOption && (
              <CommandGroup>
                <CommandItem
                  value="create-new"
                  onSelect={handleCreateNew}
                  disabled={isSaving || isCreating}
                  className="flex cursor-pointer items-center gap-2 border-b"
                >
                  {isCreating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-dynamic-purple" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-dynamic-purple" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm">
                      Create "{searchQuery.trim()}"
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Create as new task
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}

            {/* Empty state */}
            {tasks.length === 0 && !showCreateOption && (
              <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                {searchQuery ? (
                  <>
                    <Search className="mx-auto mb-1 h-4 w-4 opacity-50" />
                    No matching tasks
                  </>
                ) : (
                  emptyText
                )}
              </CommandEmpty>
            )}

            {/* Existing tasks */}
            {tasks.length > 0 && (
              <CommandGroup
                heading={showCreateOption ? 'Existing tasks' : undefined}
              >
                {tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={() => onSelect(task)}
                    disabled={isSaving}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={cn(
                          'truncate text-sm',
                          task.completed && 'text-muted-foreground line-through'
                        )}
                      >
                        {task.name}
                      </span>
                      {task.board_name && (
                        <span className="text-muted-foreground text-xs">
                          {task.board_name} #{task.display_number}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}

// Shared task search popover (with trigger button)
function TaskSearchPopover({
  wsId,
  excludeTaskIds,
  open,
  onOpenChange,
  onSelect,
  onCreateNew,
  placeholder = '',
  emptyText,
  isSaving,
}: {
  wsId: string;
  excludeTaskIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (task: RelatedTaskInfo) => void;
  onCreateNew?: (name: string) => Promise<void>;
  placeholder?: string;
  emptyText: string;
  isSaving: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start gap-2 text-muted-foreground',
            placeholder ? 'w-full' : ''
          )}
          disabled={isSaving}
        >
          <Plus className="h-4 w-4" />
          {placeholder && <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-9999 w-(--radix-popover-trigger-width) p-0"
        align="start"
        sideOffset={4}
      >
        <TaskSearchPopoverContent
          wsId={wsId}
          excludeTaskIds={excludeTaskIds}
          open={open}
          onOpenChange={onOpenChange}
          onSelect={onSelect}
          onCreateNew={onCreateNew}
          emptyText={emptyText}
          isSaving={isSaving}
        />
      </PopoverContent>
    </Popover>
  );
}
