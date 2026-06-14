'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type OperationsTableColumn<Row> = {
  cellClassName?: string;
  className?: string;
  header: ReactNode;
  key: string;
  mobileHidden?: boolean;
  mobileRender?: (row: Row) => ReactNode;
  render: (row: Row) => ReactNode;
};

export function OperationsTable<Row>({
  ariaLabel,
  columns,
  getRowClassName,
  getRowId,
  minWidth = 'min-w-[760px]',
  rows,
}: {
  ariaLabel: string;
  columns: OperationsTableColumn<Row>[];
  getRowClassName?: (row: Row) => string | undefined;
  getRowId: (row: Row) => string;
  minWidth?: string;
  rows: Row[];
}) {
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
                  className={cn(
                    'border-border/70 border-t transition-colors hover:bg-muted/20',
                    getRowClassName?.(row)
                  )}
                  key={getRowId(row)}
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
              className={cn(
                'grid gap-3 rounded-lg border border-border bg-card p-3 text-sm',
                getRowClassName?.(row)
              )}
              key={getRowId(row)}
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
