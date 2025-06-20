'use client';

import { ProjectRowActions } from './row-action';
import { ColumnDef } from '@tanstack/react-table';
import { EnhancedBoard } from './types';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Badge } from '@tuturuuu/ui/badge';
import { Progress } from '@tuturuuu/ui/progress';
import { Button } from '@tuturuuu/ui/button';
import { ExternalLink } from '@tuturuuu/ui/icons';
import moment from 'moment';
import Link from 'next/link';

export const projectColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<EnhancedBoard>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t ? t(`${namespace}.board`) : 'Board'}
      />
    ),
    cell: ({ row }) => {
      const board = row.original;
      return (
        <div className="flex items-center gap-3">
          {/* Department/Group Color Indicator */}
          <div className="w-1 h-8 rounded-full bg-primary/20" />
          <div>
            <Link
              href={board.href}
              className="font-medium hover:text-primary transition-colors hover:underline"
            >
              {board.name}
            </Link>
            {board.groupId && (
              <p className="text-xs text-muted-foreground mt-1">
                Group: {board.groupId}
              </p>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'stats.completionRate',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t ? t(`${namespace}.progress`) : 'Progress'}
      />
    ),
    cell: ({ row }) => {
      const completionRate = row.original.stats.completionRate;
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={completionRate} className="w-16 h-2" />
          <span className="text-sm font-medium min-w-[3rem]">
            {completionRate}%
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'stats.totalTasks',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t ? t(`${namespace}.tasks`) : 'Tasks'}
      />
    ),
    cell: ({ row }) => {
      const stats = row.original.stats;
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{stats.totalTasks}</span>
          <span className="text-xs text-muted-foreground">total</span>
        </div>
      );
    },
  },
  {
    id: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t ? t(`${namespace}.status`) : 'Status'}
      />
    ),
    cell: ({ row }) => {
      const stats = row.original.stats;
      return (
        <div className="flex flex-wrap gap-1">
          {stats.hasUrgentTasks && (
            <Badge variant="destructive" className="text-xs">
              Urgent
            </Badge>
          )}
          {stats.hasMultipleOverdue && (
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
              Overdue
            </Badge>
          )}
          {stats.hasWorkloadImbalance && (
            <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">
              Imbalanced
            </Badge>
          )}
          {!stats.hasUrgentTasks && !stats.hasMultipleOverdue && !stats.hasWorkloadImbalance && (
            <Badge variant="outline" className="text-xs">
              Normal
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'stats.lastActivity',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t ? t(`${namespace}.last_updated`) : 'Last Updated'}
      />
    ),
    cell: ({ row }) => {
      const lastActivity = row.original.stats.lastActivity;
      return (
        <div className="text-sm text-muted-foreground">
          {moment(lastActivity).format('MM/DD/YYYY')}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t ? t(`${namespace}.actions`) : 'Actions'}
      />
    ),
    cell: ({ row }) => {
      const board = row.original;
      return (
        <div className="flex items-center gap-2">
          <Link href={board.href}>
            <Button variant="ghost" size="sm" className="hover:bg-primary/10 hover:text-primary">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
          <ProjectRowActions row={row} />
        </div>
      );
    },
  },
];
