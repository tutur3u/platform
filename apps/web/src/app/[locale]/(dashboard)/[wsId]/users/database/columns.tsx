'use client';

import { UserRowActions } from './row-actions';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import moment from 'moment';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';

export const getUserColumns = (
  t: any,
  namespace: string | undefined,
  extraFields?: WorkspaceUserField[],
  extraData?: any
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-[8rem]">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'avatar_url',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.avatar_url`)}
      />
    ),
    cell: ({ row }) => {
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.full_name`)}
      />
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
                {t(`${namespace}.linked_to`)}{' '}
                <div>
                  {row
                    .getValue<WorkspaceUser[]>('linked_users')
                    .map((u, idx) => (
                      <Fragment key={`${u.id}-combo`}>
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
          <span
            key={`${row.id}-name`}
            className="font-semibold hover:underline"
          >
            {row.getValue('full_name') || row.getValue('display_name') || '-'}
          </span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: 'display_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.display_name`)}
      />
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
                {t(`${namespace}.linked_to`)}{' '}
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.email`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('email') || '-'}</div>,
  },
  {
    accessorKey: 'phone',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.phone`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.gender`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.birthday`)}
      />
    ),
    cell: ({ row }) => {
      const age = moment().diff(row.getValue('birthday'), 'years');

      return (
        <div className="grid min-w-[8rem] gap-1">
          <div>
            {row.getValue('birthday')
              ? dayjs(row.getValue('birthday'))
                  .locale(extraData?.locale)
                  .format(
                    extraData?.locale === 'vi' ? 'D MMMM, YYYY' : 'MMMM D, YYYY'
                  )
              : '-'}
          </div>
          {!!row.getValue('birthday') && (
            <div className="w-fit rounded border bg-foreground/5 px-2 py-0.5 text-sm font-semibold">
              {row.getValue('birthday')
                ? `${age} ${age > 1 ? t('common.years_old') : t('common.year_old')}`
                : '-'}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'ethnicity',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.ethnicity`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.guardian`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.national_id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1">{row.getValue('national_id') || '-'}</div>
    ),
  },
  {
    accessorKey: 'address',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.address`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.note`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-[8rem]">{row.getValue('note') || '-'}</div>
    ),
  },
  {
    accessorKey: 'group_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.group_count`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.linked_users`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.created_at`)}
      />
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
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.updated_at`)}
      />
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
  //     <DataTableColumnHeader t={t}column={column} title="Status" />
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
  //     <DataTableColumnHeader t={t}column={column} title="Priority" />
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
      <DataTableColumnHeader t={t} column={column} title={field.name} />
    ),
    // eslint-disable-next-line no-unused-vars
    cell: ({ row: _ }) => (
      <div className="line-clamp-1 w-[8rem]">
        {/* {row.getValue(field.id) || '-'} */}-
      </div>
    ),
  })) || []) as ColumnDef<WorkspaceUser>[]),
  {
    id: 'actions',
    cell: ({ row }) => (
      <UserRowActions
        row={row}
        href={row.original.href}
        extraData={extraData}
      />
    ),
  },
];
