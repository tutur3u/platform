import { ExternalLink } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import type { MouseEvent } from 'react';

interface TaskCardIdentifierRowProps {
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
            'h-4 w-4 shrink-0 border-2 shadow-sm transition-all duration-200 hover:scale-110 hover:border-primary/50',
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
      {isPersonalExternalTask && (
        <Badge
          variant="secondary"
          className="h-5 min-w-0 max-w-[70%] gap-1 border border-dynamic-cyan/30 bg-dynamic-cyan/10 px-1.5 text-[10px] text-dynamic-cyan"
          title={externalSourceTitle}
          data-testid="task-card-external-source"
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{externalSourceLabel}</span>
        </Badge>
      )}
      {taskListStatus !== 'documents' && ticketIdentifier && (
        <Badge
          variant="outline"
          className={cn(
            'w-fit px-1 py-0 font-mono text-[10px]',
            ticketBadgeClassName
          )}
          title={ticketTitle}
          data-testid="task-card-ticket-identifier"
        >
          {ticketIdentifier}
        </Badge>
      )}
    </div>
  );
}
