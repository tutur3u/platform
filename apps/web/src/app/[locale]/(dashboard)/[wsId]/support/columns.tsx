'use client';

import { RowActions } from './row-actions';
import { AdminRowActions } from './admin-row-actions';
import { ColumnDef } from '@tanstack/react-table';
import { Database } from '@tuturuuu/types/supabase';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Badge } from '@tuturuuu/ui/badge';
import { CheckCircle, Circle, Clock, Eye, EyeOff } from '@tuturuuu/ui/icons';
import moment from 'moment';
import Link from 'next/link';

type SupportInquiry = Database['public']['Tables']['support_inquiries']['Row'];

// User columns (for their own inquiries)
export const getUserInquiryColumns = (
  t: any,
  namespace: string | undefined,
  _?: any,
  extraData?: any
): ColumnDef<SupportInquiry>[] => [
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
      <div className="line-clamp-1 min-w-24 font-mono text-xs">
        {row.getValue('id')?.toString().slice(0, 8)}...
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
    cell: ({ row }) => {
      const href = (row.original as any).href;
      return (
        <div className="min-w-48">
          {href ? (
            <Link href={href} className="hover:underline">
              <div className="font-semibold">
                {row.getValue('subject') || t(`${namespace}.no_subject`)}
              </div>
            </Link>
          ) : (
            <div className="font-semibold">
              {row.getValue('subject') || t(`${namespace}.no_subject`)}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'message',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.message`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-2 min-w-64 max-w-96">
        {row.getValue('message') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'is_resolved',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => {
      const isResolved = row.getValue('is_resolved') as boolean;
      const isRead = row.original.is_read;
      
      if (isResolved) {
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="mr-1 h-3 w-3" />
            {t(`${namespace}.resolved`)}
          </Badge>
        );
      }
      
      if (isRead) {
        return (
          <Badge variant="secondary">
            <Eye className="mr-1 h-3 w-3" />
            {t(`${namespace}.in_progress`)}
          </Badge>
        );
      }
      
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />
          {t(`${namespace}.pending`)}
        </Badge>
      );
    },
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
        {moment(row.getValue('created_at')).format('MMM D, YYYY')}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <RowActions
        inquiry={row.original}
        extraData={extraData}
      />
    ),
  },
];

// Admin columns (for all inquiries with additional management features)
export const getAdminInquiryColumns = (
  t: any,
  namespace: string | undefined,
  _?: any,
  extraData?: any
): ColumnDef<SupportInquiry>[] => [
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
      <div className="line-clamp-1 min-w-24 font-mono text-xs">
        {row.getValue('id')?.toString().slice(0, 8)}...
      </div>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.name`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32 font-medium">
        {row.getValue('name') || t(`${namespace}.anonymous`)}
      </div>
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
      <div className="min-w-48 font-mono text-sm">
        {row.getValue('email')}
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
    cell: ({ row }) => {
      const href = (row.original as any).href;
      return (
        <div className="min-w-48">
          {href ? (
            <Link href={href} className="hover:underline">
              <div className="font-semibold">
                {row.getValue('subject') || t(`${namespace}.no_subject`)}
              </div>
            </Link>
          ) : (
            <div className="font-semibold">
              {row.getValue('subject') || t(`${namespace}.no_subject`)}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'message',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.message`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-2 min-w-64 max-w-96">
        {row.getValue('message') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'is_read',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.read_status`)}
      />
    ),
    cell: ({ row }) => {
      const isRead = row.getValue('is_read') as boolean;
      return (
        <div className="flex items-center">
          {isRead ? (
            <Badge variant="secondary">
              <Eye className="mr-1 h-3 w-3" />
              {t(`${namespace}.read`)}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <EyeOff className="mr-1 h-3 w-3" />
              {t(`${namespace}.unread`)}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'is_resolved',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.resolution_status`)}
      />
    ),
    cell: ({ row }) => {
      const isResolved = row.getValue('is_resolved') as boolean;
      return (
        <div className="flex items-center">
          {isResolved ? (
            <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle className="mr-1 h-3 w-3" />
              {t(`${namespace}.resolved`)}
            </Badge>
          ) : (
            <Badge variant="outline">
              <Circle className="mr-1 h-3 w-3" />
              {t(`${namespace}.open`)}
            </Badge>
          )}
        </div>
      );
    },
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
        {moment(row.getValue('created_at')).format('MMM D, YYYY HH:mm')}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <AdminRowActions
        inquiry={row.original}
        extraData={extraData}
      />
    ),
  },
]; 