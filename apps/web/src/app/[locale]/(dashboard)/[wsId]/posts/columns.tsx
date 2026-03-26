'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { cn } from '@tuturuuu/utils/format';
import 'dayjs/locale/vi';
import moment from 'moment';
import PostsRowActions from './row-actions';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
  getPostReviewStageAppearance,
} from './status-meta';
import type { PostEmail } from './types';

interface PostEmailExtraData {
  locale?: string;
}

export const getPostEmailColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<PostEmail> & {
  extraData?: PostEmailExtraData;
}): ColumnDef<PostEmail>[] => [
  {
    accessorKey: 'stage',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.stage`)}
      />
    ),
    cell: ({ row }) => {
      const value = row.getValue('stage') as PostEmail['stage'];
      const {
        icon: Icon,
        className,
        iconClassName,
        labelKey,
      } = getPostReviewStageAppearance(value);

      return (
        <Badge variant="outline" className={className}>
          <Icon className={cn('mr-1 h-3.5 w-3.5', iconClassName)} />
          {t(`${namespace}.${labelKey}`)}
        </Badge>
      );
    },
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
    accessorKey: 'approval_status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.approval_status`)}
      />
    ),
    cell: ({ row }) => {
      const value = row.getValue(
        'approval_status'
      ) as PostEmail['approval_status'];

      if (!value) {
        return <Badge variant="outline">-</Badge>;
      }

      const {
        icon: Icon,
        className,
        labelKey,
      } = getPostApprovalStatusAppearance(value);

      return (
        <Badge variant="outline" className={className}>
          <Icon className="mr-1 h-3.5 w-3.5" />
          {t(`${namespace}.${labelKey}`)}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'queue_status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.queue_status`)}
      />
    ),
    cell: ({ row }) => {
      const value = row.getValue('queue_status') as PostEmail['queue_status'];

      if (!value) {
        return <div>-</div>;
      }

      const {
        icon: Icon,
        className,
        iconClassName,
        labelKey,
      } = getPostEmailStatusAppearance(value);

      return (
        <Badge variant="outline" className={className}>
          <Icon className={cn('mr-1 h-3.5 w-3.5', iconClassName)} />
          {t(`${namespace}.${labelKey}`)}
        </Badge>
      );
    },
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
    cell: ({ row }) => {
      const value = row.getValue('is_completed') as PostEmail['is_completed'];

      return (
        <div className="flex items-center justify-center">
          {value == null ? (
            <div className="rounded-full bg-dynamic-blue/15 px-2 py-1 text-dynamic-blue text-xs">
              -
            </div>
          ) : value ? (
            <div className="rounded-full bg-dynamic-green/15 p-1 text-dynamic-green">
              <Check className="h-3.5 w-3.5" />
            </div>
          ) : (
            <div className="rounded-full bg-dynamic-red/15 p-1 text-dynamic-red">
              <X className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      );
    },
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
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return <PostsRowActions data={row.original} />;
    },
  },
];
