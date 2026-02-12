import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  Check,
  FileEdit,
  Link2,
  ListTodo,
  Loader2,
  ShieldAlert,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DialogDescription, DialogTitle } from '@tuturuuu/ui/dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getTicketIdentifier } from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TaskViewerAvatarsComponent } from '../../user-presence-avatars';
import { TaskDialogActions } from '../task-dialog-actions';
import type {
  PendingRelationship,
  PendingRelationshipType,
} from '../types/pending-relationship';
import { QuickSettingsPopover } from './quick-settings-popover';

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
const RELATIONSHIP_HEADER_CONFIG = (t: any) => ({
  subtask: {
    title: t('ws-task-boards.dialog.create_subtask'),
    descriptionPrefix: t('ws-task-boards.dialog.subtask_of'),
    icon: <ArrowDownFromLine className="h-4 w-4 text-dynamic-blue" />,
    iconBgClass: 'bg-dynamic-blue/10',
    iconRingClass: 'ring-dynamic-blue/20',
  },
  parent: {
    title: t('ws-task-boards.dialog.create_parent_task'),
    descriptionPrefix: t('ws-task-boards.dialog.parent_of'),
    icon: <ArrowUpFromLine className="h-4 w-4 text-dynamic-purple" />,
    iconBgClass: 'bg-dynamic-purple/10',
    iconRingClass: 'ring-dynamic-purple/20',
  },
  blocking: {
    title: t('ws-task-boards.dialog.create_blocking_task'),
    descriptionPrefix: t('ws-task-boards.dialog.will_be_blocked_by'),
    icon: <ShieldAlert className="h-4 w-4 text-dynamic-red" />,
    iconBgClass: 'bg-dynamic-red/10',
    iconRingClass: 'ring-dynamic-red/20',
  },
  'blocked-by': {
    title: t('ws-task-boards.dialog.create_blocked_task'),
    descriptionPrefix: t('ws-task-boards.dialog.will_block'),
    icon: <ShieldAlert className="h-4 w-4 text-dynamic-yellow" />,
    iconBgClass: 'bg-dynamic-yellow/10',
    iconRingClass: 'ring-dynamic-yellow/20',
  },
  related: {
    title: t('ws-task-boards.dialog.create_related_task'),
    descriptionPrefix: t('ws-task-boards.dialog.related_to'),
    icon: <Link2 className="h-4 w-4 text-dynamic-cyan" />,
    iconBgClass: 'bg-dynamic-cyan/10',
    iconRingClass: 'ring-dynamic-cyan/20',
  },
});

/**
 * Helper to generate dialog header info based on task context
 */
export function getTaskDialogHeaderInfo(
  options: {
    isCreateMode: boolean;
    parentTaskId?: string | null;
    parentTaskName?: string | null;
    pendingRelationship?: PendingRelationship | null;
    draftId?: string | null;
  },
  t: any
): DialogHeaderInfo {
  const {
    isCreateMode,
    parentTaskId,
    parentTaskName,
    pendingRelationship,
    draftId,
  } = options;

  const relationshipConfig = RELATIONSHIP_HEADER_CONFIG(t);

  // Handle pending relationship (new way)
  if (isCreateMode && pendingRelationship) {
    const config = relationshipConfig[pendingRelationship.type];
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
    const config = relationshipConfig.subtask;
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
        t('ws-task-boards.dialog.of_parent_task')
      ),
      icon: config.icon,
      iconBgClass: config.iconBgClass,
      iconRingClass: config.iconRingClass,
    };
  }

  // Editing an existing draft
  if (isCreateMode && draftId) {
    return {
      title: t('task-drafts.edit_draft'),
      icon: <FileEdit className="h-4 w-4 text-dynamic-orange" />,
    };
  }

  // Default create mode
  if (isCreateMode) {
    return {
      title: t('ws-task-boards.dialog.create_new_task'),
    };
  }

  // Edit mode
  return {
    title: t('ws-task-boards.dialog.edit_task'),
  };
}

interface TaskDialogHeaderProps {
  isCreateMode: boolean;
  collaborationMode?: boolean;
  /** Whether realtime features (Yjs sync, presence avatars) are enabled - true for all tiers */
  realtimeEnabled?: boolean;
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
  saveAsDraft: boolean;
  setSaveAsDraft: (value: boolean) => void;
  draftId?: string;
  /** Whether the title input is currently visible in the scroll area */
  isTitleVisible?: boolean;
  /** Current task name from the form */
  taskName?: string;
  /** Board ticket prefix for building the identifier */
  ticketPrefix?: string | null;
  /** Task display number for building the identifier */
  displayNumber?: number;
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
  /** Whether the workspace is personal (affects auto-assign setting) */
  isPersonalWorkspace?: boolean;
  /** Callback to open share dialog */
  onOpenShareDialog?: () => void;
  /** Whether the dialog is in read-only mode */
  disabled?: boolean;
  /** Callback to scroll the editor to a collaborator's cursor position */
  onScrollToUserCursor?: (userId: string, displayName: string) => void;
}

export function TaskDialogHeader({
  isCreateMode,
  collaborationMode,
  realtimeEnabled,
  isOpen,
  synced,
  connected,
  taskId,
  parentTaskId,
  parentTaskName,
  pendingRelationship,
  headerInfo,
  user,
  saveAsDraft,
  setSaveAsDraft,
  draftId,
  isTitleVisible = true,
  taskName,
  ticketPrefix,
  displayNumber,
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
  isPersonalWorkspace = false,
  onOpenShareDialog,
  disabled = false,
  onScrollToUserCursor,
}: TaskDialogHeaderProps) {
  const t = useTranslations();

  // Use custom headerInfo if provided, otherwise generate from task context
  const resolvedHeaderInfo =
    headerInfo ??
    getTaskDialogHeaderInfo(
      {
        isCreateMode,
        parentTaskId,
        parentTaskName,
        pendingRelationship,
        draftId,
      },
      t
    );

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

  // When the title input scrolls out of view, show ticket ID badge + task name in the header
  const trimmedTaskName = taskName?.trim();
  const showScrollTitle = !isTitleVisible && !!trimmedTaskName;
  const ticketId =
    !isCreateMode && displayNumber
      ? getTicketIdentifier(ticketPrefix, displayNumber)
      : null;

  return (
    <div className="flex items-center justify-between border-b px-4 py-2 md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1',
            iconBgClass,
            iconRingClass
          )}
        >
          {icon ?? <ListTodo className={cn('h-4 w-4', iconColorClass)} />}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle className="flex items-center gap-1.5 truncate font-semibold text-base text-foreground md:text-lg">
            {showScrollTitle ? (
              <>
                {ticketId && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 border border-border/60 px-1.5 py-0 font-mono text-[10px] text-muted-foreground md:text-xs"
                  >
                    {ticketId}
                  </Badge>
                )}
                <span className="truncate">{trimmedTaskName}</span>
              </>
            ) : (
              title
            )}
          </DialogTitle>
          {!showScrollTitle && description && (
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
                    ? t('ws-task-boards.dialog.synced')
                    : !connected
                      ? t('ws-task-boards.dialog.reconnecting')
                      : t('ws-task-boards.dialog.syncing')}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-1.5">
                <p className="font-medium">
                  {synced && connected
                    ? t('ws-task-boards.dialog.all_changes_synced')
                    : !connected
                      ? t('ws-task-boards.dialog.connection_lost')
                      : t('ws-task-boards.dialog.syncing_in_progress')}
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-dynamic-green' : 'bg-dynamic-red'}`}
                    />
                    <span>
                      {connected
                        ? t('ws-task-boards.dialog.connected')
                        : t('ws-task-boards.dialog.disconnected')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${synced ? 'bg-dynamic-green' : 'bg-dynamic-yellow'}`}
                    />
                    <span>
                      {synced
                        ? t('ws-task-boards.dialog.synced')
                        : t('ws-task-boards.dialog.syncing')}
                    </span>
                  </div>
                </div>
                {!connected && (
                  <p className="text-muted-foreground text-xs">
                    {t('ws-task-boards.dialog.reconnect_automatic')}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Online Users - shown for all tiers when realtimeEnabled */}
        {realtimeEnabled && isOpen && !isCreateMode && user && taskId && (
          <TaskViewerAvatarsComponent
            taskId={taskId}
            compact={false}
            onClickUser={onScrollToUserCursor}
          />
        )}

        {isCreateMode && !draftId && (
          <label className="hidden items-center gap-2 text-muted-foreground text-xs md:flex">
            <Switch
              checked={saveAsDraft}
              onCheckedChange={(v) => setSaveAsDraft(Boolean(v))}
            />
            <span className="flex items-center gap-1">
              {saveAsDraft && (
                <FileEdit className="h-3 w-3 text-dynamic-orange" />
              )}
              {t('task-drafts.save_as_draft')}
            </span>
          </label>
        )}

        {isCreateMode && !draftId && (
          <label className="hidden items-center gap-2 text-muted-foreground text-xs md:flex">
            <Switch
              checked={createMultiple}
              onCheckedChange={(v) => setCreateMultiple(Boolean(v))}
            />
            {t('ws-task-boards.dialog.create_multiple')}
          </label>
        )}

        {/* Quick Settings */}
        {!disabled && (
          <QuickSettingsPopover isPersonalWorkspace={isPersonalWorkspace} />
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
          onOpenShareDialog={onOpenShareDialog}
          disabled={disabled}
        />

        {/* Hide save button in edit mode when collaboration is enabled (realtime sync) */}
        {!disabled && (isCreateMode || !collaborationMode) && (
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
                    {t('ws-task-boards.dialog.saving')}
                  </>
                ) : (
                  <>
                    {isCreateMode && saveAsDraft ? (
                      <FileEdit className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isCreateMode
                      ? saveAsDraft || draftId
                        ? t('common.save')
                        : t('ws-task-boards.dialog.create_task')
                      : t('ws-task-boards.dialog.save_changes')}
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
