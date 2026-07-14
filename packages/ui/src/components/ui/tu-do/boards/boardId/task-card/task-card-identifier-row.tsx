import { CheckLine, ExternalLink, NotebookPen } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import type { MouseEvent } from 'react';
import { TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES } from './task-card-checkbox-style';

interface TaskCardIdentifierRowProps {
  documentLabel: string;
  externalSourceLabel: string;
  externalSourceTitle?: string;
  isMultiSelectMode: boolean;
  isPersonalExternalTask: boolean;
  isSelected: boolean;
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  selectTaskLabel: string;
  selectionCheckboxClassName?: string;
  taskListStatus?: string | null;
  ticketBadgeClassName?: string;
  ticketIdentifier: string | null;
  ticketTitle: string;
}

export function TaskCardIdentifierRow({
  documentLabel,
  externalSourceLabel,
  externalSourceTitle,
  isMultiSelectMode,
  isPersonalExternalTask,
  isSelected,
  onSelect,
  selectTaskLabel,
  selectionCheckboxClassName,
  taskListStatus,
  ticketBadgeClassName,
  ticketIdentifier,
  ticketTitle,
}: TaskCardIdentifierRowProps) {
  return (
    <div
      className={cn(
        'mb-1 flex min-w-0 flex-wrap items-center gap-1',
        isPersonalExternalTask && 'gap-x-1.5'
      )}
    >
      {isMultiSelectMode && (
        <Checkbox
          checked={isSelected}
          aria-label={selectTaskLabel}
          data-testid="task-card-selection-checkbox"
          className={cn(
            TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES,
            selectionCheckboxClassName
          )}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect?.(event);
          }}
        />
      )}
      {taskListStatus === 'documents' && (
        <Badge
          variant="secondary"
          className="h-4 gap-0.5 border border-border/80 bg-muted/70 px-1 text-[9px] text-muted-foreground"
          data-testid="task-card-document-type"
        >
          <NotebookPen className="h-2.5 w-2.5 shrink-0" />
          <span>{documentLabel}</span>
        </Badge>
      )}
      {isPersonalExternalTask && (
        <Badge
          variant="secondary"
          className="h-4 min-w-0 max-w-[70%] gap-0.5 border border-dynamic-cyan/30 bg-dynamic-cyan/10 px-1 text-[9px] text-dynamic-cyan"
          title={externalSourceTitle}
          data-testid="task-card-external-source"
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{externalSourceLabel}</span>
        </Badge>
      )}
      {ticketIdentifier && (
        <Badge
          variant="outline"
          className={cn(
            'h-4 w-fit gap-0.5 px-1 py-0 font-mono text-[9px]',
            ticketBadgeClassName
          )}
          title={ticketTitle}
          data-testid="task-card-ticket-identifier"
        >
          <CheckLine className="h-2.5 w-2.5 shrink-0" />
          {ticketIdentifier}
        </Badge>
      )}
    </div>
  );
}
