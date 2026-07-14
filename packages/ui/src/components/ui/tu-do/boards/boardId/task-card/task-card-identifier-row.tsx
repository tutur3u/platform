import { CheckLine, ExternalLink, NotebookPen } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { Fragment, type MouseEvent } from 'react';
import { TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES } from './task-card-checkbox-style';

const COMPACT_CYAN_BADGE_CLASSES =
  'h-4 min-w-0 max-w-[70%] gap-0.5 border border-dynamic-cyan/30 bg-dynamic-cyan/10 px-1 text-[9px] text-dynamic-cyan';

interface TaskCardIdentifierRowProps {
  documentLabel: string;
  externalSourceBreadcrumbs?: Array<{ href?: string; label: string }>;
  externalSourceHref?: string;
  externalSourceLabel: string;
  externalSourceTitle?: string;
  isMultiSelectMode: boolean;
  isPersonalExternalTask: boolean;
  isSelected: boolean;
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  selectTaskLabel: string;
  selectTaskTooltipLabel?: string;
  selectionCheckboxClassName?: string;
  taskListStatus?: string | null;
  ticketBadgeClassName?: string;
  ticketIdentifier: string | null;
  ticketTitle: string;
}

export function TaskCardIdentifierRow({
  documentLabel,
  externalSourceBreadcrumbs,
  externalSourceHref,
  externalSourceLabel,
  externalSourceTitle,
  isMultiSelectMode,
  isPersonalExternalTask,
  isSelected,
  onSelect,
  selectTaskLabel,
  selectTaskTooltipLabel,
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
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent side="top">
            {selectTaskTooltipLabel ?? selectTaskLabel}
          </TooltipContent>
        </Tooltip>
      )}
      {taskListStatus === 'documents' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              aria-label={documentLabel}
              variant="secondary"
              className={COMPACT_CYAN_BADGE_CLASSES}
              data-testid="task-card-document-type"
            >
              <NotebookPen className="h-2.5 w-2.5 shrink-0" />
              <span>{documentLabel}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">{documentLabel}</TooltipContent>
        </Tooltip>
      )}
      {isPersonalExternalTask && (
        <Tooltip>
          <TooltipTrigger asChild>
            {externalSourceHref ? (
              <Badge
                asChild
                variant="secondary"
                className={cn(
                  COMPACT_CYAN_BADGE_CLASSES,
                  'cursor-pointer hover:bg-dynamic-cyan/15'
                )}
              >
                <Link
                  aria-label={externalSourceTitle || externalSourceLabel}
                  data-testid="task-card-external-source"
                  href={externalSourceHref}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{externalSourceLabel}</span>
                </Link>
              </Badge>
            ) : (
              <Badge
                aria-label={externalSourceTitle || externalSourceLabel}
                variant="secondary"
                className={COMPACT_CYAN_BADGE_CLASSES}
                data-testid="task-card-external-source"
              >
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{externalSourceLabel}</span>
              </Badge>
            )}
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="pointer-events-auto max-w-xs px-2 py-1.5"
          >
            {externalSourceBreadcrumbs?.length ? (
              <Breadcrumb>
                <BreadcrumbList className="gap-1 text-xs sm:gap-1">
                  {externalSourceBreadcrumbs.map((item, index) => (
                    <Fragment key={`${item.label}:${item.href ?? index}`}>
                      {index > 0 && (
                        <BreadcrumbSeparator className="[&>svg]:size-3" />
                      )}
                      <BreadcrumbItem>
                        {item.href ? (
                          <BreadcrumbLink asChild>
                            <Link
                              href={item.href}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {item.label}
                            </Link>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage>{item.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              externalSourceTitle || externalSourceLabel
            )}
          </TooltipContent>
        </Tooltip>
      )}
      {ticketIdentifier && taskListStatus !== 'documents' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              aria-label={ticketTitle}
              variant="outline"
              className={cn(
                'h-4 w-fit gap-0.5 px-1 py-0 font-mono text-[9px]',
                ticketBadgeClassName
              )}
              data-testid="task-card-ticket-identifier"
            >
              <CheckLine className="h-2.5 w-2.5 shrink-0" />
              {ticketIdentifier}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">{ticketTitle}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
