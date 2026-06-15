'use client';

import { cn } from '@tuturuuu/utils/format';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

export type OperationsTableColumn<Row> = {
  cellClassName?: string;
  className?: string;
  header: ReactNode;
  key: string;
  mobileHidden?: boolean;
  mobileRender?: (row: Row) => ReactNode;
  render: (row: Row) => ReactNode;
};

/**
 * Returns true when a click/keypress originated from an interactive element
 * (button, link, form control, menu item) so row activation never fights with
 * the controls rendered inside a row — most importantly the actions column.
 */
function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, label, [role="menuitem"], [data-no-row-activate]'
    )
  );
}

export function OperationsTable<Row>({
  ariaLabel,
  columns,
  getRowClassName,
  getRowId,
  minWidth = 'min-w-[760px]',
  onRowActivate,
  rowActivateLabel,
  rows,
}: {
  ariaLabel: string;
  columns: OperationsTableColumn<Row>[];
  getRowClassName?: (row: Row) => string | undefined;
  getRowId: (row: Row) => string;
  minWidth?: string;
  onRowActivate?: (row: Row) => void;
  rowActivateLabel?: (row: Row) => string;
  rows: Row[];
}) {
  const handleRowClick = onRowActivate
    ? (row: Row) => (event: MouseEvent) => {
        if (isInteractiveTarget(event.target)) return;
        onRowActivate(row);
      }
    : undefined;
  const handleRowKeyDown = onRowActivate
    ? (row: Row) => (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        onRowActivate(row);
      }
    : undefined;
  const interactiveRowClass = onRowActivate
    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
    : undefined;
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card lg:block">
        <div className="overflow-x-auto">
          <table
            aria-label={ariaLabel}
            className={cn('w-full table-fixed text-left text-sm', minWidth)}
          >
            <thead className="border-border border-b bg-muted/45 text-muted-foreground text-xs">
              <tr>
                {columns.map((column) => (
                  <th
                    className={cn(
                      'px-4 py-3 font-semibold tracking-normal',
                      column.className
                    )}
                    key={column.key}
                    scope="col"
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  aria-label={
                    onRowActivate ? rowActivateLabel?.(row) : undefined
                  }
                  className={cn(
                    'border-border/70 border-t transition-colors hover:bg-muted/20',
                    interactiveRowClass,
                    getRowClassName?.(row)
                  )}
                  key={getRowId(row)}
                  onClick={handleRowClick?.(row)}
                  onKeyDown={handleRowKeyDown?.(row)}
                  tabIndex={onRowActivate ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td
                      className={cn(
                        'px-4 py-3 align-middle',
                        column.cellClassName
                      )}
                      key={column.key}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-3 lg:hidden">
        {rows.map((row) => {
          const primaryColumn = columns[0];
          const detailColumns = columns.slice(1).filter((column) => {
            return !column.mobileHidden;
          });

          return (
            <article
              aria-label={onRowActivate ? rowActivateLabel?.(row) : undefined}
              className={cn(
                'grid gap-3 rounded-lg border border-border bg-card p-3 text-sm',
                interactiveRowClass,
                getRowClassName?.(row)
              )}
              key={getRowId(row)}
              onClick={handleRowClick?.(row)}
              onKeyDown={handleRowKeyDown?.(row)}
              tabIndex={onRowActivate ? 0 : undefined}
            >
              {primaryColumn ? (
                <div className="min-w-0">{primaryColumn.render(row)}</div>
              ) : null}
              <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
                {detailColumns.map((column) => (
                  <div
                    className={cn(
                      'min-w-0 rounded-md border border-border bg-muted/20 p-2',
                      column.cellClassName
                    )}
                    key={column.key}
                  >
                    <dt className="mb-1 truncate text-muted-foreground text-xs">
                      {column.header}
                    </dt>
                    <dd className="min-w-0">
                      {column.mobileRender?.(row) ?? column.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
