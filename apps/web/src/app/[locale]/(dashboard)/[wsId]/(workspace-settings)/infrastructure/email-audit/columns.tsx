'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { Tables } from '@tuturuuu/types/supabase';

import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Badge } from '@tuturuuu/ui/badge';
import moment from 'moment';

export type EmailAuditRecord = Tables<'email_audit'> & {
  users: { id: string; display_name: string } | null;
  workspaces: { id: string; name: string } | null;
};

export const getEmailAuditColumns = (
  t: any,
  namespace: string | undefined,
  _extraColumns?: any[],
  _extraData?: any
): ColumnDef<EmailAuditRecord>[] => [
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
      <div className="font-mono text-xs">
        {row.getValue<string>('id').slice(0, 8)}...
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
      <div className="text-sm">
        {moment(row.getValue<string>('created_at')).format(
          'MMM DD, YYYY HH:mm'
        )}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => {
      const status = row.getValue<string>('status');
      const statusColors: Record<string, string> = {
        pending:
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        bounced:
          'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
        complained:
          'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      };
      return (
        <Badge variant="outline" className={statusColors[status] || ''}>
          {status}
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
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
      <div className="max-w-[300px] truncate font-medium">
        {row.getValue<string>('subject')}
      </div>
    ),
  },
  {
    accessorKey: 'to_addresses',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.to_addresses`)}
      />
    ),
    cell: ({ row }) => {
      const addresses = row.getValue<string[]>('to_addresses');
      const display = addresses.slice(0, 2).join(', ');
      const remaining = addresses.length - 2;
      return (
        <div className="max-w-[200px] truncate text-sm">
          {display}
          {remaining > 0 && (
            <span className="text-muted-foreground"> +{remaining}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'source_email',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.source_email`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-sm">
        <div className="font-medium">{row.original.source_name}</div>
        <div className="text-muted-foreground">
          {row.getValue<string>('source_email')}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'template_type',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.template_type`)}
      />
    ),
    cell: ({ row }) => {
      const templateType = row.getValue<string | null>('template_type');
      return templateType ? (
        <Badge variant="secondary">{templateType}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'provider',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.provider`)}
      />
    ),
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.getValue<string>('provider').toUpperCase()}
      </Badge>
    ),
  },
  {
    accessorKey: 'users',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.sent_by`)}
      />
    ),
    cell: ({ row }) => {
      const user = row.original.users;
      return user ? (
        <div className="text-sm">{user.display_name}</div>
      ) : (
        <span className="text-muted-foreground">System</span>
      );
    },
  },
  {
    accessorKey: 'workspaces',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.workspace`)}
      />
    ),
    cell: ({ row }) => {
      const workspace = row.original.workspaces;
      return workspace ? (
        <div className="text-sm">{workspace.name}</div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'error_message',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.error_message`)}
      />
    ),
    cell: ({ row }) => {
      const errorMessage = row.getValue<string | null>('error_message');
      return errorMessage ? (
        <div
          className="max-w-[200px] truncate text-sm text-red-600 dark:text-red-400"
          title={errorMessage}
        >
          {errorMessage}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'sent_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.sent_at`)}
      />
    ),
    cell: ({ row }) => {
      const sentAt = row.getValue<string | null>('sent_at');
      return sentAt ? (
        <div className="text-sm">
          {moment(sentAt).format('MMM DD, YYYY HH:mm')}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'message_id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.message_id`)}
      />
    ),
    cell: ({ row }) => {
      const messageId = row.getValue<string | null>('message_id');
      return messageId ? (
        <div
          className="max-w-[150px] truncate font-mono text-xs"
          title={messageId}
        >
          {messageId}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'cc_addresses',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.cc_addresses`)}
      />
    ),
    cell: ({ row }) => {
      const addresses = row.getValue<string[]>('cc_addresses');
      return addresses.length > 0 ? (
        <div className="text-sm">{addresses.join(', ')}</div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'bcc_addresses',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.bcc_addresses`)}
      />
    ),
    cell: ({ row }) => {
      const addresses = row.getValue<string[]>('bcc_addresses');
      return addresses.length > 0 ? (
        <div className="text-sm">{addresses.join(', ')}</div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'reply_to_addresses',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.reply_to`)}
      />
    ),
    cell: ({ row }) => {
      const addresses = row.getValue<string[]>('reply_to_addresses');
      return addresses.length > 0 ? (
        <div className="text-sm">{addresses.join(', ')}</div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'content_hash',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.content_hash`)}
      />
    ),
    cell: ({ row }) => {
      const hash = row.getValue<string | null>('content_hash');
      return hash ? (
        <div className="max-w-[100px] truncate font-mono text-xs" title={hash}>
          {hash}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'ip_address',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.ip_address`)}
      />
    ),
    cell: ({ row }) => {
      const ip = row.getValue<string | null>('ip_address');
      return ip ? (
        <div className="font-mono text-xs">{ip}</div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'user_agent',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.user_agent`)}
      />
    ),
    cell: ({ row }) => {
      const ua = row.getValue<string | null>('user_agent');
      return ua ? (
        <div className="max-w-[150px] truncate text-xs" title={ua}>
          {ua}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
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
      <div className="text-sm">
        {moment(row.getValue<string>('updated_at')).format(
          'MMM DD, YYYY HH:mm'
        )}
      </div>
    ),
  },
];
