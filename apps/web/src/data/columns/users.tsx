'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '../../app/(dashboard)/[wsId]/users/list/data-table-column-header';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import moment from 'moment';

export const userColumns: ColumnDef<WorkspaceUser>[] = [
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
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => <div>{row.getValue('name') || '-'}</div>,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => <div>{row.getValue('email') || '-'}</div>,
  },
  {
    accessorKey: 'phone',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Phone" />
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
      <DataTableColumnHeader column={column} title="Gender" />
    ),
    cell: ({ row }) => (
      <div className="w-[80px]">{row.getValue('gender') || '-'}</div>
    ),
  },
  {
    accessorKey: 'birthday',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Birthday" />
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
      <DataTableColumnHeader column={column} title="Ethnicity" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[80px]">
        {row.getValue('ethnicity') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'guardian',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Guardian" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[80px]">
        {row.getValue('guardian') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'national_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="National ID" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1">{row.getValue('national_id') || '-'}</div>
    ),
  },
  {
    accessorKey: 'address',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Address" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[80px]">
        {row.getValue('address') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'note',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Note" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[80px]">{row.getValue('note') || '-'}</div>
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
