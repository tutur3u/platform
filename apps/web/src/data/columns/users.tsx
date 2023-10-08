'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/custom/tables/data-table-column-header';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import moment from 'moment';
import { Translate } from 'next-translate';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const getUserColumns = (t: Translate): ColumnDef<WorkspaceUser>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
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
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {Array.isArray(row.getValue('linked_users')) &&
        row.getValue<WorkspaceUser[]>('linked_users').length !== 0 ? (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger className="font-semibold underline">
                {row.getValue('name') || '-'}
              </TooltipTrigger>
              <TooltipContent className="text-center">
                {t('linked_to')}{' '}
                <div>
                  {row
                    .getValue<WorkspaceUser[]>('linked_users')
                    .map((u, idx) => (
                      <>
                        <span
                          key={u.id}
                          className="font-semibold hover:underline"
                        >
                          {u.display_name}
                        </span>
                        {idx !==
                          row.getValue<WorkspaceUser[]>('linked_users').length -
                            1 && <span>, </span>}
                      </>
                    ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          row.getValue('name') || '-'
        )}
      </div>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('email')} />
    ),
    cell: ({ row }) => <div>{row.getValue('email') || '-'}</div>,
  },
  {
    accessorKey: 'phone',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('phone')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[100px]">
        {row.getValue('phone') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'gender',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('gender')} />
    ),
    cell: ({ row }) => (
      <div className="w-[8rem]">{row.getValue('gender') || '-'}</div>
    ),
  },
  {
    accessorKey: 'birthday',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('birthday')} />
    ),
    cell: ({ row }) => (
      <div>
        {row.getValue('birthday')
          ? moment(row.getValue('birthday')).format('DD/MM/YYYY')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'ethnicity',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('ethnicity')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[8rem]">
        {row.getValue('ethnicity') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'guardian',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('guardian')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[8rem]">
        {row.getValue('guardian') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'national_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('national_id')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1">{row.getValue('national_id') || '-'}</div>
    ),
  },
  {
    accessorKey: 'address',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('address')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[8rem]">
        {row.getValue('address') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'note',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('note')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[8rem]">{row.getValue('note') || '-'}</div>
    ),
  },
  {
    accessorKey: 'linked_users',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('linked_users')} />
    ),
    cell: ({ row }) => (
      <div>
        {Array.isArray(row.getValue('linked_users')) &&
        row.getValue<WorkspaceUser[]>('linked_users').length !== 0
          ? row.getValue<WorkspaceUser[]>('linked_users').map((u) => (
              <span key={u.id} className="font-semibold hover:underline">
                {u.display_name}
              </span>
            ))
          : '-'}
      </div>
    ),
  },
  // {
  //   accessorKey: 'status',
  //   header: ({ column }) => (
  //     <DataTableColumnHeader column={column} title="Status" />
  //   ),
  //   cell: ({ row }) => {
  //     const status = statuses.find(
  //       (status) => status.value === row.getValue('status')
  //     );

  //     if (!status) {
  //       return null;
  //     }

  //     return (
  //       <div className="flex w-[100px] items-center">
  //         {status.icon && (
  //           <status.icon className="text-muted-foreground mr-2 h-4 w-4" />
  //         )}
  //         <span>{status.label}</span>
  //       </div>
  //     );
  //   },
  //   filterFn: (row, id, value) => {
  //     return value.includes(row.getValue(id));
  //   },
  // },
  // {
  //   accessorKey: 'priority',
  //   header: ({ column }) => (
  //     <DataTableColumnHeader column={column} title="Priority" />
  //   ),
  //   cell: ({ row }) => {
  //     const priority = priorities.find(
  //       (priority) => priority.value === row.getValue('priority')
  //     );

  //     if (!priority) {
  //       return null;
  //     }

  //     return (
  //       <div className="flex items-center">
  //         {priority.icon && (
  //           <priority.icon className="text-muted-foreground mr-2 h-4 w-4" />
  //         )}
  //         <span>{priority.label}</span>
  //       </div>
  //     );
  //   },
  //   filterFn: (row, id, value) => {
  //     return value.includes(row.getValue(id));
  //   },
  // },
  // {
  //   id: 'actions',
  //   cell: ({ row }) => <UserRowActions row={row} />,
  // },
];
