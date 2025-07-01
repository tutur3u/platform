'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { PostEmail } from '@tuturuuu/types/primitives/post-email';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { createPostEmailKey, usePosts } from '../use-posts';
import PostsRowActions from './posts-row-actions';
import 'dayjs/locale/vi';
import moment from 'moment';

const CellWrapper = ({
  row,
  children,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: <>
  row: any;
  children: React.ReactNode;
}) => {
  const [posts, _setPosts] = usePosts();
  const postKey = createPostEmailKey(row.original);
  const isSelected = posts.selected === postKey;

  return (
    <div
      className={cn(
        'w-full h-full cursor-pointer px-2 py-1.5 rounded-md transition-colors',
        isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
      )}
    >
      {children}
    </div>
  );
};

export const getPostEmailColumns = (
  // biome-ignore lint/suspicious/noExplicitAny: <translations are not typed>
  t: any,
  namespace: string | undefined
): ColumnDef<PostEmail>[] => [
  {
    accessorKey: 'recipient',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.recipient`)}
      />
    ),
    cell: ({ row }) => (
      <CellWrapper row={row}>{row.getValue('recipient') || '-'}</CellWrapper>
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
    cell: ({ row }) => (
      <CellWrapper row={row}>{row.getValue('email') || '-'}</CellWrapper>
    ),
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
      <CellWrapper row={row}>
        <span className="line-clamp-1 min-w-32 text-primary">
          {row.getValue('group_name') || '-'}
        </span>
      </CellWrapper>
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
      <CellWrapper row={row}>
        <span className="line-clamp-1 min-w-32 text-primary">
          {row.getValue('post_title') || '-'}
        </span>
      </CellWrapper>
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
    cell: ({ row }) => (
      <CellWrapper row={row}>{row.getValue('subject') || '-'}</CellWrapper>
    ),
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
      <CellWrapper row={row}>
        <div className="line-clamp-3 max-w-40 whitespace-pre-line">
          {row.getValue('post_content') || '-'}
        </div>
      </CellWrapper>
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
      <CellWrapper row={row}>
        <div className="flex items-center justify-center">
          {row.getValue('is_completed') ? <Check /> : <X />}
        </div>
      </CellWrapper>
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
      <CellWrapper row={row}>
        <div className="line-clamp-1 min-w-32">
          {row.getValue('notes') || '-'}
        </div>
      </CellWrapper>
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
      <CellWrapper row={row}>
        <div className="min-w-32">
          {moment(row.getValue('created_at')).format('DD/MM/YYYY')}
        </div>
      </CellWrapper>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <PostsRowActions data={row.original} />,
  },
];
