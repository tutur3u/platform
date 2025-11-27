import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  Check,
  Link2,
  ListTodo,
  Loader2,
  ShieldAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DialogDescription, DialogTitle } from '@tuturuuu/ui/dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { UserPresenceAvatarsComponent } from '../../user-presence-avatars';
import { TaskDialogActions } from '../task-dialog-actions';
import type {
  PendingRelationship,
  PendingRelationshipType,
} from '../types/pending-relationship';

// Re-export for external use
export type { PendingRelationship, PendingRelationshipType };

/**
 * Reusable dialog header info configuration
 * Use this to customize the dialog's title, description, and icon
 */
export interface DialogHeaderInfo {
  /** The main title text */
  title: string;
  /** Optional description text (can include ReactNode for rich content) */
  description?: ReactNode;
  /** Icon element to display (defaults to ListTodo) */
  icon?: ReactNode;
  /** Icon container background color class (defaults to bg-dynamic-orange/10) */
  iconBgClass?: string;
  /** Icon container ring color class (defaults to ring-dynamic-orange/20) */
  iconRingClass?: string;
  /** Icon color class (defaults to text-dynamic-orange) */
  iconColorClass?: string;
}

/** Configuration for each relationship type */
const RELATIONSHIP_HEADER_CONFIG: Record<
  PendingRelationshipType,
  {
    title: string;
    descriptionPrefix: string;
    icon: ReactNode;
    iconBgClass: string;
    iconRingClass: string;
  }
> = {
  subtask: {
    title: 'Create Sub-Task',
    descriptionPrefix: 'Sub-task of',
    icon: <ArrowDownFromLine className="h-4 w-4 text-dynamic-blue" />,
    iconBgClass: 'bg-dynamic-blue/10',
    iconRingClass: 'ring-dynamic-blue/20',
  },
  parent: {
    title: 'Create Parent Task',
    descriptionPrefix: 'Parent of',
    icon: <ArrowUpFromLine className="h-4 w-4 text-dynamic-purple" />,
    iconBgClass: 'bg-dynamic-purple/10',
    iconRingClass: 'ring-dynamic-purple/20',
  },
  blocking: {
    title: 'Create Blocking Task',
    descriptionPrefix: 'Will be blocked by',
    icon: <ShieldAlert className="h-4 w-4 text-dynamic-red" />,
    iconBgClass: 'bg-dynamic-red/10',
    iconRingClass: 'ring-dynamic-red/20',
  },
  'blocked-by': {
    title: 'Create Blocked Task',
    descriptionPrefix: 'Will block',
    icon: <ShieldAlert className="h-4 w-4 text-dynamic-yellow" />,
    iconBgClass: 'bg-dynamic-yellow/10',
    iconRingClass: 'ring-dynamic-yellow/20',
  },
  related: {
    title: 'Create Related Task',
    descriptionPrefix: 'Related to',
    icon: <Link2 className="h-4 w-4 text-dynamic-cyan" />,
    iconBgClass: 'bg-dynamic-cyan/10',
    iconRingClass: 'ring-dynamic-cyan/20',
  },
};

/**
 * Helper to generate dialog header info based on task context
 */
export function getTaskDialogHeaderInfo(options: {
  isCreateMode: boolean;
  parentTaskId?: string | null;
  parentTaskName?: string | null;
  pendingRelationship?: PendingRelationship | null;
}): DialogHeaderInfo {
  const { isCreateMode, parentTaskId, parentTaskName, pendingRelationship } =
    options;

  // Handle pending relationship (new way)
  if (isCreateMode && pendingRelationship) {
    const config = RELATIONSHIP_HEADER_CONFIG[pendingRelationship.type];
    return {
      title: config.title,
      description: (
        <span className="flex items-center gap-1">
          {config.descriptionPrefix}{' '}
          <span className="font-medium text-foreground">
            "{pendingRelationship.relatedTaskName}"
          </span>
        </span>
      ),
      icon: config.icon,
      iconBgClass: config.iconBgClass,
      iconRingClass: config.iconRingClass,
    };
  }

  // Handle legacy subtask creation via parentTaskId
  if (isCreateMode && parentTaskId) {
    const config = RELATIONSHIP_HEADER_CONFIG.subtask;
    return {
      title: config.title,
      description: parentTaskName ? (
        <span className="flex items-center gap-1">
          {config.descriptionPrefix}{' '}
          <span className="font-medium text-foreground">
            "{parentTaskName}"
          </span>
        </span>
      ) : (
        'of parent task'
      ),
      icon: config.icon,
      iconBgClass: config.iconBgClass,
      iconRingClass: config.iconRingClass,
    };
  }

  // Default create mode
  if (isCreateMode) {
    return {
      title: 'Create New Task',
    };
  }

  // Edit mode
  return {
    title: 'Edit Task',
  };
}

interface TaskDialogHeaderProps {
  isCreateMode: boolean;
  collaborationMode?: boolean;
  isOpen: boolean;
  synced: boolean;
  connected: boolean;
  taskId?: string;
  parentTaskId?: string | null;
  parentTaskName?: string | null;
  /** Pending relationship info for dynamic header generation */
  pendingRelationship?: PendingRelationship | null;
  /** Custom header info - overrides all default title/description logic */
  headerInfo?: DialogHeaderInfo;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
  createMultiple: boolean;
  hasDraft: boolean;
  wsId: string;
  boardId: string;
  pathname: string;
  canSave: boolean;
  isLoading: boolean;
  setCreateMultiple: (value: boolean) => void;
  handleClose: () => void;
  setShowDeleteConfirm: (value: boolean) => void;
  clearDraftState: () => void;
  handleSave: () => void;
  /** Callback to navigate back to the related task (for create mode with pending relationship) */
  onNavigateBack?: () => void;
}

export function TaskDialogHeader({
  isCreateMode,
  collaborationMode,
  isOpen,
  synced,
  connected,
  taskId,
  parentTaskId,
  parentTaskName,
  pendingRelationship,
  headerInfo,
  user,
  createMultiple,
  hasDraft,
  wsId,
  boardId,
  pathname,
  canSave,
  isLoading,
  setCreateMultiple,
  handleClose,
  setShowDeleteConfirm,
  clearDraftState,
  handleSave,
  onNavigateBack,
}: TaskDialogHeaderProps) {
  // Use custom headerInfo if provided, otherwise generate from task context
  const resolvedHeaderInfo =
    headerInfo ??
    getTaskDialogHeaderInfo({
      isCreateMode,
      parentTaskId,
      parentTaskName,
      pendingRelationship,
    });

  // Determine the task name to navigate back to (from pending relationship or parent task)
  const navigateBackTaskName =
    pendingRelationship?.relatedTaskName ?? parentTaskName;

  const {
    title,
    description,
    icon,
    iconBgClass = 'bg-dynamic-orange/10',
    iconRingClass = 'ring-dynamic-orange/20',
    iconColorClass = 'text-dynamic-orange',
  } = resolvedHeaderInfo;

  return (
    <div className="flex items-center justify-between border-b px-4 py-2 md:px-8">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg ring-1',
            iconBgClass,
            iconRingClass
          )}
        >
          {icon ?? <ListTodo className={cn('h-4 w-4', iconColorClass)} />}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle className="truncate font-semibold text-base text-foreground md:text-lg">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="truncate text-muted-foreground text-xs md:text-sm">
              {description}
            </DialogDescription>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        {/* Collaboration Sync Status */}
        {collaborationMode && isOpen && !isCreateMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors',
                  synced && connected
                    ? 'bg-dynamic-green/10 text-dynamic-green'
                    : !connected
                      ? 'bg-dynamic-red/10 text-dynamic-red'
                      : 'bg-dynamic-yellow/10 text-dynamic-yellow'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    synced && connected
                      ? 'animate-pulse bg-dynamic-green'
                      : !connected
                        ? 'bg-dynamic-red'
                        : 'animate-pulse bg-dynamic-yellow'
                  )}
                />
                <span className="font-medium">
                  {synced && connected
                    ? 'Synced'
                    : !connected
                      ? 'Reconnecting...'
                      : 'Syncing...'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-1.5">
                <p className="font-medium">
                  {synced && connected
                    ? 'All changes synced'
                    : !connected
                      ? 'Connection lost'
                      : 'Syncing in progress'}
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-dynamic-green' : 'bg-dynamic-red'}`}
                    />
                    <span>{connected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${synced ? 'bg-dynamic-green' : 'bg-dynamic-yellow'}`}
                    />
                    <span>{synced ? 'Synced' : 'Syncing'}</span>
                  </div>
                </div>
                {!connected && (
                  <p className="text-muted-foreground text-xs">
                    Attempting to reconnect automatically...
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Online Users */}
        {collaborationMode && isOpen && !isCreateMode && user && taskId && (
          <UserPresenceAvatarsComponent
            channelName={`task_presence_${taskId}`}
            currentUser={{
              id: user.id || '',
              email: user.email || '',
              display_name: user.display_name || undefined,
              avatar_url: user.avatar_url || undefined,
            }}
          />
        )}

        {isCreateMode && (
          <label className="hidden items-center gap-2 text-muted-foreground text-xs md:flex">
            <Switch
              checked={createMultiple}
              onCheckedChange={(v) => setCreateMultiple(Boolean(v))}
            />
            Create multiple
          </label>
        )}

        <TaskDialogActions
          isCreateMode={isCreateMode}
          hasDraft={hasDraft}
          taskId={taskId}
          wsId={wsId}
          boardId={boardId}
          pathname={pathname}
          navigateBackTaskName={navigateBackTaskName}
          onClose={handleClose}
          onShowDeleteDialog={() => setShowDeleteConfirm(true)}
          onClearDraft={clearDraftState}
          onNavigateBack={onNavigateBack}
        />

        {/* Hide save button in edit mode when collaboration is enabled (realtime sync) */}
        {(isCreateMode || !collaborationMode) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={!canSave}
                size="xs"
                className="hidden md:inline-flex"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {isCreateMode ? 'Create Task' : 'Save Changes'}
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Cmd/Ctrl + Enter</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
