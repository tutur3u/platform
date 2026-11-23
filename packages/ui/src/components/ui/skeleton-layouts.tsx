import { cn } from '@tuturuuu/utils/format';
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonLine,
  SkeletonText,
} from './skeleton-primitive';

/**
 * Layout-matched placeholders. Each one copies the box model of the shared
 * component it stands in for (padding, border, height), so the real content
 * replaces it without a layout shift.
 */

/**
 * Matches `Card` + `CardHeader` + `CardContent` spacing. The title line uses a
 * 16px box because `CardTitle` is `leading-none`.
 */
export function SkeletonCard({
  lines = 3,
  withHeader = true,
  className,
}: {
  lines?: number;
  withHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-card"
      className={cn('rounded-xl border bg-card shadow-sm', className)}
    >
      {withHeader ? (
        <div className="flex flex-col gap-1.5 p-6">
          <SkeletonLine size="xs" barClassName="w-1/3" />
          <SkeletonLine size="sm" barClassName="w-1/2" />
        </div>
      ) : null}
      <div className={cn('p-6', withHeader && 'pt-0')}>
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/** Avatar, title and subtitle, optional trailing control. */
export function SkeletonListRow({
  withAvatar = true,
  withSubtitle = true,
  withTrailing = false,
  className,
}: {
  withAvatar?: boolean;
  withSubtitle?: boolean;
  withTrailing?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-list-row"
      className={cn('flex items-center gap-3 px-3 py-2', className)}
    >
      {withAvatar ? <SkeletonAvatar size="md" /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <SkeletonLine size="sm" barClassName="w-2/5" />
        {withSubtitle ? <SkeletonLine size="xs" barClassName="w-3/5" /> : null}
      </div>
      {withTrailing ? <Skeleton className="h-8 w-16 shrink-0" /> : null}
    </div>
  );
}

/** Several list rows, for menus, pickers and feeds. */
export function SkeletonList({
  rows = 4,
  className,
  rowClassName,
  ...rowProps
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
  withAvatar?: boolean;
  withSubtitle?: boolean;
  withTrailing?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-list"
      className={cn('flex flex-col', className)}
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          className={rowClassName}
          {...rowProps}
        />
      ))}
    </div>
  );
}

const CELL_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-2/5'];

/**
 * `<tr>` placeholders for a `Table` body. Cells copy `TableCell` padding, so
 * columns keep their width while data loads.
 */
export function SkeletonTableRows({
  rows = 5,
  columns,
  className,
}: {
  rows?: number;
  columns: number;
  className?: string;
}) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr
      // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
      key={rowIndex}
      aria-hidden="true"
      data-slot="skeleton-table-row"
      className={cn('border-b', className)}
    >
      {Array.from({ length: columns }, (_, columnIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <td key={columnIndex} className="p-2 pl-3 align-middle">
          <SkeletonLine
            size="sm"
            barClassName={
              CELL_WIDTHS[(rowIndex + columnIndex) % CELL_WIDTHS.length]
            }
          />
        </td>
      ))}
    </tr>
  ));
}

/** Matches `SidebarMenuButton` (h-8, px-2, icon + label). */
export function SkeletonSidebarItem({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-sidebar-item"
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
    >
      <Skeleton className="size-4 shrink-0 rounded" />
      {collapsed ? null : <Skeleton className="h-3.5 flex-1" />}
    </div>
  );
}

/** Matches `SelectTrigger` (h-9 bordered input with a chevron). */
export function SkeletonSelectorTrigger({
  withIcon = false,
  className,
}: {
  withIcon?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-selector-trigger"
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 shadow-xs',
        className
      )}
    >
      {withIcon ? <Skeleton className="size-5 shrink-0 rounded" /> : null}
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="size-4 shrink-0 rounded-sm" />
    </div>
  );
}
