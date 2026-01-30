'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from '@tuturuuu/icons';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import 'dayjs/locale/vi';
import moment from 'moment';
import PostsRowActions from './row-actions';
import type { PostEmail } from './types';

interface PostEmailExtraData {
  locale?: string;
  onEmailSent: () => void;
  blacklistedEmails?: Set<string>;
}

export const getPostEmailColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<PostEmail> & {
  extraData?: PostEmailExtraData;
}): ColumnDef<PostEmail>[] => [
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
      <div className="line-clamp-1 min-w-32 text-primary">
        {row.getValue('group_name') || '-'}
      </div>
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
      <div className="line-clamp-1 min-w-32 text-primary">
        {row.getValue('post_title') || '-'}
      </div>
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
    accessorKey: 'post_content',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.post_content`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-3 max-w-40 whitespace-pre-line">
        {row.getValue('post_content') || '-'}
      </div>
    ),
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
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        {row.getValue('is_completed') ? <Check /> : <X />}
      </div>
    ),
  },
  {
    accessorKey: 'notes',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.notes`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32">
        {row.getValue('notes') || '-'}
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
        {moment(row.getValue('created_at')).format('DD/MM/YYYY')}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return (
        <PostsRowActions
          data={row.original}
          onEmailSent={extraData.onEmailSent}
          isEmailBlacklisted={
            row.original.email
              ? (extraData.blacklistedEmails?.has(row.original.email) ?? false)
              : false
          }
        />
      );
    },
  },
];
