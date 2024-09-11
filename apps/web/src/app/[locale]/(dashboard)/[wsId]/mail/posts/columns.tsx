'use client';

import { PostEmail } from '@/types/primitives/post-email';
import { Button } from '@repo/ui/components/ui/button';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import 'dayjs/locale/vi';
import { Check, Eye, MailCheck, Send, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';

export const getPostEmailColumns = (
  t: any,
  namespace: string
  // extraData?: any
): ColumnDef<PostEmail>[] => [
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
    accessorKey: 'recipient',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.recipient`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('recipient') || '-'}</div>,
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
    accessorKey: 'group_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.group_name`)}
      />
    ),
    cell: ({ row }) => (
      <Link
        href={`/${row.original.ws_id}/users/groups/${row.original.group_id}`}
        className="line-clamp-1 min-w-[8rem] hover:underline"
      >
        {row.getValue('group_name') || '-'}
      </Link>
    ),
  },
  {
    accessorKey: 'post_title',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.post_title`)}
      />
    ),
    cell: ({ row }) => (
      <Link
        href={`/${row.original.ws_id}/users/groups/${row.original.group_id}/posts/${row.original.post_id}`}
        className="line-clamp-1 min-w-[8rem] hover:underline"
      >
        {row.getValue('post_title') || '-'}
      </Link>
    ),
  },
  {
    accessorKey: 'subject',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.subject`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('subject') || '-'}</div>,
  },
  {
    accessorKey: 'is_completed',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.is_completed`)}
      />
    ),
    cell: ({ row }) => (row.getValue('is_completed') ? <Check /> : <X />),
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
    id: 'actions',
    cell: ({ row }) => (
      <div className="flex flex-none items-center justify-end gap-2">
        <Button
          size="xs"
          variant={
            row.original.email && !row.original.email_id ? undefined : 'outline'
          }
          // disabled={!row.original.email || !!row.original.email_id}
          disabled
        >
          {row.original.email_id ? (
            <MailCheck className="h-4 w-4" />
          ) : (
            <>
              <Send className="mr-1.5 h-4 w-4" />
              {t(`${namespace}.send_email`)}
            </>
          )}
        </Button>
        <Button size="xs" variant="outline" disabled>
          <Eye className="mr-1.5 h-4 w-4" />
          {t(`${namespace}.preview`)}
        </Button>
      </div>
    ),
  },
];
