'use client';

import type { JSONContent } from '@tiptap/react';
import { Maximize2, SquareKanban, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DialogDescription, DialogTitle } from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { QuickCreateDescriptionInput } from './quick-create/quick-create-description-input';
import { QuickCreateFooter } from './quick-create/quick-create-footer';
import { markTaskSaveShortcutHandled } from './quick-create/quick-create-shortcut';
import { useQuickCreateKeyboardInset } from './quick-create/use-quick-create-keyboard-inset';

interface CompactTaskDialogPanelProps {
  /** The dialog's accessible name; the header itself stays visual-only. */
  title: string;
  /** Relationship context such as "Subtask of …"; replaces the board chip. */
  description?: ReactNode;
  icon?: ReactNode;
  /** The board the task lands on, shown as the header's context chip. */
  contextLabel?: ReactNode;
  titleInput: ReactNode;
  /** With a change handler, renders the optional plain description line. */
  taskDescription?: JSONContent | null;
  onTaskDescriptionChange?: (description: JSONContent | null) => void;
  descriptionPreview?: ReactNode;
  descriptionPreviewLabel?: string;
  taskStatus?: ReactNode;
  propertyControls: ReactNode;
  /** Disables the description line along with the property controls. */
  disabled?: boolean;
  editActions?: ReactNode;
  saveAsDraft?: boolean;
  createMultiple?: boolean;
  canSave?: boolean;
  isLoading?: boolean;
  onSaveAsDraftChange?: (value: boolean) => void;
  onCreateMultipleChange?: (value: boolean) => void;
  onClose: () => void;
  onFullscreen: () => void;
  /** Defaults to expanding the dialog. */
  onDescriptionPreviewClick?: () => void;
  onSave?: () => void;
}

function HeaderIconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className="size-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The compact task dialog: a context chip with expand and close, the title,
 * an optional description, labeled property chips and, when creating, the
 * create footer. Header and footer stay fixed while the body scrolls.
 * Smart suggestions and other secondary actions live in the expanded editor.
 */
export function CompactTaskDialogPanel({
  title,
  description,
  icon,
  contextLabel,
  titleInput,
  taskDescription,
  onTaskDescriptionChange,
  descriptionPreview,
  descriptionPreviewLabel,
  taskStatus,
  propertyControls,
  disabled = false,
  editActions,
  saveAsDraft,
  createMultiple,
  canSave,
  isLoading = false,
  onSaveAsDraftChange,
  onCreateMultipleChange,
  onClose,
  onFullscreen,
  onDescriptionPreviewClick,
  onSave,
}: CompactTaskDialogPanelProps) {
  const t = useTranslations();
  const panelRef = useRef<HTMLDivElement>(null);
  useQuickCreateKeyboardInset(panelRef);
  const createActions =
    typeof saveAsDraft === 'boolean' &&
    typeof createMultiple === 'boolean' &&
    typeof canSave === 'boolean' &&
    onSave &&
    onSaveAsDraftChange &&
    onCreateMultipleChange
      ? {
          saveAsDraft,
          createMultiple,
          canSave,
          onSave,
          onSaveAsDraftChange,
          onCreateMultipleChange,
        }
      : null;
  const context = description ?? contextLabel;

  // Cmd+Enter on macOS, Ctrl+Enter elsewhere. Marking the event keeps the
  // dialog's window-level shortcut from saving the same press a second time.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'Enter' ||
      !(event.metaKey || event.ctrlKey) ||
      event.nativeEvent.isComposing ||
      !createActions?.canSave
    ) {
      return;
    }

    event.preventDefault();
    markTaskSaveShortcutHandled(event.nativeEvent);
    createActions.onSave();
  };

  return (
    <div
      ref={panelRef}
      className="relative flex min-h-0 flex-1 flex-col"
      onKeyDown={handleKeyDown}
    >
      <div
        data-testid="compact-task-dialog-panel"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit] bg-popover"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-input sm:hidden"
        />
        <div className="flex min-h-11 shrink-0 items-center gap-2 pt-2 pr-3 pl-4 max-sm:pt-1">
          {context ? (
            <DialogDescription
              asChild
              className="inline-flex h-7 min-w-0 items-center gap-1.5 truncate rounded-full bg-secondary px-2.5 font-semibold text-muted-foreground text-xs"
            >
              <div data-testid="compact-task-context">
                <span className="shrink-0 [&_svg]:size-3.5">
                  {icon ?? <SquareKanban aria-hidden="true" />}
                </span>
                <span className="min-w-0 truncate">{context}</span>
              </div>
            </DialogDescription>
          ) : null}
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-1">
            {editActions}
            <HeaderIconButton
              label={t('ws-task-boards.dialog.enlarge_dialog')}
              onClick={onFullscreen}
            >
              <Maximize2 className="size-4" />
            </HeaderIconButton>
            <HeaderIconButton label={t('common.close')} onClick={onClose}>
              <X className="size-4" />
            </HeaderIconButton>
          </div>
        </div>

        <div
          data-testid="compact-task-dialog-body"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pt-2 pb-4 max-sm:px-4"
        >
          <div className="space-y-1">
            {titleInput}
            {taskDescription !== undefined && onTaskDescriptionChange ? (
              <QuickCreateDescriptionInput
                description={taskDescription}
                disabled={disabled}
                onDescriptionChange={onTaskDescriptionChange}
                onOpenEditor={onFullscreen}
              />
            ) : null}
          </div>
          {taskStatus}
          <div className="flex flex-wrap items-center gap-1.5">
            {propertyControls}
          </div>
        </div>

        {createActions ? (
          <QuickCreateFooter {...createActions} isLoading={isLoading} />
        ) : null}
      </div>

      {descriptionPreview && (
        <button
          type="button"
          data-testid="compact-task-description-preview"
          aria-label={
            descriptionPreviewLabel ?? t('ws-task-boards.dialog.enlarge_dialog')
          }
          className="absolute top-full left-1/2 mt-2 w-full max-w-[30rem] -translate-x-1/2 rounded-lg border bg-background/95 px-4 py-3 text-left opacity-70 shadow-xl ring-1 ring-border/60 backdrop-blur transition hover:bg-muted/70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:hidden"
          onClick={onDescriptionPreviewClick ?? onFullscreen}
        >
          <div className="text-muted-foreground text-sm leading-relaxed">
            {descriptionPreview}
          </div>
        </button>
      )}
    </div>
  );
}

/** Alias kept for existing imports of the quick-create panel. */
export const CompactTaskCreatePopover = CompactTaskDialogPanel;
