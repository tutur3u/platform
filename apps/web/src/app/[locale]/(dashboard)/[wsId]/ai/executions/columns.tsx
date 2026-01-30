'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceAIExecution } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { RowActions } from './row-actions';
import { calculateCost, formatCost } from './utils/cost-calculator';

export const getColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<WorkspaceAIExecution>): ColumnDef<WorkspaceAIExecution>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'model_id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.model_id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('model_id')}</div>
    ),
  },
  {
    accessorKey: 'input',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.input`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32" title={row.getValue('input')}>
        {row.getValue('input')}
      </div>
    ),
  },
  {
    accessorKey: 'output',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.output`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32" title={row.getValue('output')}>
        {row.getValue('output')}
      </div>
    ),
  },
  {
    accessorKey: 'input_tokens',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.input_tokens`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24">{row.getValue('input_tokens')}</div>
    ),
  },
  {
    accessorKey: 'output_tokens',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.output_tokens`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24">{row.getValue('output_tokens')}</div>
    ),
  },
  {
    accessorKey: 'reasoning_tokens',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.reasoning_tokens`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24">{row.getValue('reasoning_tokens')}</div>
    ),
  },
  {
    accessorKey: 'total_tokens',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.total_tokens`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24">{row.getValue('total_tokens')}</div>
    ),
  },
  {
    accessorKey: 'cost',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.cost`)}
      />
    ),
    cell: ({ row }) => {
      const execution = row.original;
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });
      return (
        <div className="min-w-32">
          <div className="font-medium">{formatCost(cost.totalCostUSD)}</div>
          <div className="text-muted-foreground text-xs">
            {formatCost(cost.totalCostVND, 'VND')}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'finish_reason',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.finish_reason`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('finish_reason')}</div>
    ),
  },
  {
    accessorKey: 'system_prompt',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.system_prompt`)}
      />
    ),
    cell: ({ row }) => (
      <div
        className="line-clamp-1 min-w-32"
        title={row.getValue('system_prompt')}
      >
        {row.getValue('system_prompt')}
      </div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.created_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {moment(row.getValue('created_at')).format('DD/MM/YYYY HH:mm:ss')}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <RowActions row={row} extraData={extraData} />,
  },
];
