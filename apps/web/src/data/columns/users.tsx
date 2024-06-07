'use client';

import { UserRowActions } from '@/components/row-actions/users';
import { DataTableColumnHeader } from '@/components/ui/custom/tables/data-table-column-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { Translate } from 'next-translate';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';

export const getUserColumns = (
  t: Translate,
  extraFields?: WorkspaceUserField[]
): ColumnDef<WorkspaceUser>[] => [
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
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-[8rem]">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'avatar_url',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('avatar_url')} />
    ),
    cell: async ({ row }) => {
      const avatarUrl = row.getValue('avatar_url') as string | undefined;
      if (!avatarUrl) return <div className="min-w-[8rem]">-</div>;

      return (
        <Image
          width={128}
          height={128}
          src={avatarUrl}
          alt="Avatar"
          className="aspect-square min-w-[8rem] rounded-lg object-cover"
        />
      );
    },
  },
  {
    accessorKey: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('full_name')} />
    ),
    cell: ({ row }) => (
      <Link href={row.original.href || '#'} className="min-w-[8rem]">
        {Array.isArray(row.getValue('linked_users')) &&
        row.getValue<WorkspaceUser[]>('linked_users').length !== 0 ? (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger className="font-semibold underline">
                {row.getValue('full_name') ||
                  row.getValue('display_name') ||
                  '-'}
              </TooltipTrigger>
              <TooltipContent className="text-center">
                {t('linked_to')}{' '}
                <div>
                  {row
                    .getValue<WorkspaceUser[]>('linked_users')
                    .map((u, idx) => (
                      <Fragment key={u.id}>
                        <span
                          key={`${u.id}-name`}
                          className="font-semibold hover:underline"
                        >
                          {u.display_name}
                        </span>
                        {idx !==
                          row.getValue<WorkspaceUser[]>('linked_users').length -
                            1 && <span key={`${u.id}-separator`}>, </span>}
                      </Fragment>
                    ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          row.getValue('full_name') || row.getValue('display_name') || '-'
        )}
      </Link>
    ),
  },
  {
    accessorKey: 'display_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('display_name')} />
    ),
    cell: ({ row }) => (
      <Link href={row.original.href || '#'} className="min-w-[8rem]">
        {Array.isArray(row.getValue('linked_users')) &&
        row.getValue<WorkspaceUser[]>('linked_users').length !== 0 ? (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger className="font-semibold underline">
                {row.getValue('display_name') ||
                  row.getValue('full_name') ||
                  '-'}
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
          row.getValue('display_name') || row.getValue('full_name') || '-'
        )}
      </Link>
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
      <div className="w-[8rem]">
        {row.getValue('gender')
          ? t(row.getValue<string>('gender').toLowerCase())
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'birthday',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('birthday')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
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
    accessorKey: 'group_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('group_count')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[8rem]">
        {row.getValue('group_count') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'linked_users',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('linked_users')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
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
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('created_at')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {moment(row.getValue('created_at')).format('DD/MM/YYYY')}
      </div>
    ),
  },
  {
    accessorKey: 'updated_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('updated_at')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {moment(row.getValue('updated_at')).format('DD/MM/YYYY')}
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
  ...((extraFields?.map((field) => ({
    id: field.id,
    accessorKey: field.id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={field.name} />
    ),
    cell: ({ row: _ }) => (
      <div className="line-clamp-1 w-[8rem]">
        {/* {row.getValue(field.id) || '-'} */}-
      </div>
    ),
  })) || []) as ColumnDef<WorkspaceUser>[]),
  {
    id: 'actions',
    cell: ({ row }) => <UserRowActions row={row} href={row.original.href} />,
  },
];
