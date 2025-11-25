import { Check, ListTodo, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DialogDescription, DialogTitle } from '@tuturuuu/ui/dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { UserPresenceAvatarsComponent } from '../../user-presence-avatars';
import { TaskDialogActions } from '../task-dialog-actions';

interface TaskDialogHeaderProps {
  isCreateMode: boolean;
  collaborationMode?: boolean;
  isOpen: boolean;
  synced: boolean;
  connected: boolean;
  taskId?: string;
  parentTaskId?: string | null;
  parentTaskName?: string | null;
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
}: TaskDialogHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2 md:px-8">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
          <ListTodo className="h-4 w-4 text-dynamic-orange" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle className="truncate font-semibold text-base text-foreground md:text-lg">
            {isCreateMode && parentTaskId
              ? 'Creating Sub-Task'
              : isCreateMode
                ? 'Create New Task'
                : 'Edit Task'}
          </DialogTitle>
          <DialogDescription className="truncate text-xs text-muted-foreground md:text-sm">
            {isCreateMode && parentTaskId && parentTaskName
              ? `of "${parentTaskName}"`
              : isCreateMode && parentTaskId
                ? 'of parent task'
                : ''}
          </DialogDescription>
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
        {collaborationMode && isOpen && !isCreateMode && user && (
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
          onClose={handleClose}
          onShowDeleteDialog={() => setShowDeleteConfirm(true)}
          onClearDraft={clearDraftState}
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
    </>
  );
}
