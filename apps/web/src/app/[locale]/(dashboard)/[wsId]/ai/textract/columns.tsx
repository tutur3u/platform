'use client';

import { AIPromptRowActions } from './row-actions';
import { AIPrompt } from '@/types/db';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { Translate } from 'next-translate';

export const aiPromptsColumns = (
  t: Translate,
  setAIPrompt: (value: AIPrompt | undefined) => void
): ColumnDef<AIPrompt>[] => [
  // {
  //   id: 'select',
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={table.getIsAllPageRowsSelected()}
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  // },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('id')} />
    ),
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('name')} />
    ),
    cell: ({ row }) => <div>{row.getValue('name') || '-'}</div>,
  },
  {
    accessorKey: 'model',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('model')} />
    ),
    cell: ({ row }) => <div>{row.getValue('model') || '-'}</div>,
  },
  {
    accessorKey: 'input',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('input')} />
    ),
    cell: ({ row }) => <div>{row.getValue('input') || '-'}</div>,
  },
  {
    accessorKey: 'output',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('output')} />
    ),
    cell: ({ row }) => <div>{row.getValue('output') || '-'}</div>,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('created_at')} />
    ),
    cell: ({ row }) => (
      <div>
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <AIPromptRowActions row={row} setAIPrompt={setAIPrompt} />
    ),
  },
];
