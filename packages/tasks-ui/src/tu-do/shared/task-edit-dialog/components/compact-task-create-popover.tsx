'use client';

import {
  Check,
  Copy,
  FileEdit,
  ListTodo,
  Loader2,
  Maximize2,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DialogDescription, DialogTitle } from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { QuickSettingsPopover } from './quick-settings-popover';

interface CompactTaskDialogPanelProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  iconBgClass?: string;
  iconRingClass?: string;
  titleInput: ReactNode;
  showHeaderTitle?: boolean;
  descriptionPreview?: string | null;
  descriptionPreviewLabel?: string;
  taskStatus?: ReactNode;
  propertyControls: ReactNode;
  editActions?: ReactNode;
  smartAction?: ReactNode;
  smartPanel?: ReactNode;
  saveAsDraft?: boolean;
  createMultiple?: boolean;
  canSave?: boolean;
  isLoading?: boolean;
  isPersonalWorkspace?: boolean;
  onSaveAsDraftChange?: (value: boolean) => void;
  onCreateMultipleChange?: (value: boolean) => void;
  onClose: () => void;
  onFullscreen: () => void;
  onDescriptionPreviewClick?: () => void;
  onSave?: () => void;
}

function CompactIconButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          aria-label={typeof label === 'string' ? label : undefined}
          aria-pressed={active}
          className={cn(
            'h-8 w-8 text-muted-foreground hover:text-foreground',
            active && 'text-foreground'
          )}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function CompactTaskDialogPanel({
  title,
  description,
  icon,
  iconBgClass = 'bg-dynamic-orange/10',
  iconRingClass = 'ring-dynamic-orange/20',
  titleInput,
  showHeaderTitle = true,
  descriptionPreview,
  descriptionPreviewLabel,
  taskStatus,
  propertyControls,
  editActions,
  smartAction,
  smartPanel,
  saveAsDraft,
  createMultiple,
  canSave,
  isLoading = false,
  isPersonalWorkspace,
  onSaveAsDraftChange,
  onCreateMultipleChange,
  onClose,
  onFullscreen,
  onDescriptionPreviewClick,
  onSave,
}: CompactTaskDialogPanelProps) {
  const t = useTranslations();
  const hasCreateActions =
    typeof saveAsDraft === 'boolean' &&
    typeof createMultiple === 'boolean' &&
    typeof canSave === 'boolean' &&
    !!onSave &&
    !!onSaveAsDraftChange &&
    !!onCreateMultipleChange;
  const saveLabel = saveAsDraft
    ? t('task-drafts.save_as_draft')
    : t('ws-task-boards.dialog.create_task');
  const hasHeaderTitle = showHeaderTitle;

  return (
    <div className="relative">
      <div
        data-testid="compact-task-dialog-panel"
        className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden rounded-lg bg-background"
      >
        <div
          className={cn(
            'flex items-start gap-3 border-b px-4 py-3',
            hasHeaderTitle ? 'justify-between' : 'justify-end'
          )}
        >
          {hasHeaderTitle ? (
            <div className="flex min-w-0 items-start gap-2.5">
              <div
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1',
                  iconBgClass,
                  iconRingClass
                )}
              >
                {icon ?? <ListTodo className="h-4 w-4 text-dynamic-orange" />}
              </div>
              <div className="min-w-0 space-y-0.5">
                <DialogTitle className="truncate font-semibold text-base">
                  {title}
                </DialogTitle>
                {description && (
                  <DialogDescription className="truncate text-muted-foreground text-xs">
                    {description}
                  </DialogDescription>
                )}
              </div>
            </div>
          ) : (
            <DialogTitle className="sr-only">{title}</DialogTitle>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {smartAction}
            {editActions}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('ws-task-boards.dialog.open_fullscreen')}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onFullscreen}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('ws-task-boards.dialog.open_fullscreen')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.close')}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('common.close')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3">
          {titleInput}
          {taskStatus}
          <div className="flex flex-wrap items-center gap-1.5">
            {propertyControls}
          </div>
          {smartPanel}
        </div>

        {hasCreateActions && (
          <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-1">
              <CompactIconButton
                active={!!saveAsDraft}
                label={t('task-drafts.save_as_draft')}
                onClick={() => onSaveAsDraftChange?.(!saveAsDraft)}
              >
                <FileEdit className="h-4 w-4" />
              </CompactIconButton>
              <CompactIconButton
                active={!!createMultiple}
                label={t('ws-task-boards.dialog.create_multiple')}
                onClick={() => onCreateMultipleChange?.(!createMultiple)}
              >
                <Copy className="h-4 w-4" />
              </CompactIconButton>
              <QuickSettingsPopover isPersonalWorkspace={isPersonalWorkspace} />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={() => onSave?.()}
              className="min-w-28"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('ws-task-boards.dialog.saving')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {saveLabel}
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {descriptionPreview && onDescriptionPreviewClick && (
        <button
          type="button"
          data-testid="compact-task-description-preview"
          aria-label={
            descriptionPreviewLabel ??
            t('ws-task-boards.dialog.open_fullscreen')
          }
          className="absolute top-full left-1/2 mt-2 w-full max-w-[30rem] -translate-x-1/2 rounded-lg border bg-background/95 px-4 py-3 text-left opacity-70 shadow-xl ring-1 ring-border/60 backdrop-blur transition hover:bg-muted/70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDescriptionPreviewClick}
        >
          <span className="line-clamp-3 whitespace-pre-line text-muted-foreground text-sm leading-relaxed">
            {descriptionPreview}
          </span>
        </button>
      )}
    </div>
  );
}

export const CompactTaskCreatePopover = CompactTaskDialogPanel;
