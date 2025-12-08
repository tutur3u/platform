'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle, XCircle, Shield } from '@tuturuuu/icons';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Badge } from '@tuturuuu/ui/badge';
import moment from 'moment';

export interface AbuseEventEntry {
  id: string;
  ip_address: string;
  event_type: string;
  email_hash?: string | null;
  user_agent?: string | null;
  endpoint?: string | null;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

const getEventTypeBadge = (eventType: string) => {
  const colors: Record<string, string> = {
    otp_send: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    otp_verify_failed:
      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    mfa_challenge:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    mfa_verify_failed:
      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    reauth_send:
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    reauth_verify_failed:
      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    password_login_failed:
      'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  };

  const labels: Record<string, string> = {
    otp_send: 'OTP Send',
    otp_verify_failed: 'OTP Verify Failed',
    mfa_challenge: 'MFA Challenge',
    mfa_verify_failed: 'MFA Verify Failed',
    reauth_send: 'Reauth Send',
    reauth_verify_failed: 'Reauth Verify Failed',
    password_login_failed: 'Password Login Failed',
  };

  return (
    <Badge className={colors[eventType] || ''}>
      {labels[eventType] || eventType}
    </Badge>
  );
};

export const getAbuseEventsColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<AbuseEventEntry>[] => [
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
      <div className="line-clamp-1 max-w-32 font-mono text-xs">
        {row.getValue('id')}
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
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
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
    cell: ({ row }) => (
      <div className="flex items-center gap-2 font-mono text-sm">
        <Shield className="h-4 w-4 text-muted-foreground" />
        {row.getValue('ip_address')}
      </div>
    ),
  },
  {
    accessorKey: 'event_type',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.event_type`)}
      />
    ),
    cell: ({ row }) => getEventTypeBadge(row.getValue('event_type')),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'success',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.success`)}
      />
    ),
    cell: ({ row }) => {
      const success = row.getValue<boolean>('success');
      return (
        <div className="flex items-center gap-1">
          {success ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                Success
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600 dark:text-red-400">
                Failed
              </span>
            </>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'email_hash',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.email_hash`)}
      />
    ),
    cell: ({ row }) => {
      const hash = row.getValue<string | null>('email_hash');
      return (
        <div className="max-w-24 truncate font-mono text-xs text-muted-foreground">
          {hash || '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'endpoint',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.endpoint`)}
      />
    ),
    cell: ({ row }) => {
      const endpoint = row.getValue<string | null>('endpoint');
      return (
        <div className="max-w-48 truncate font-mono text-xs">
          {endpoint || '-'}
        </div>
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
      const userAgent = row.getValue<string | null>('user_agent');
      return (
        <div className="max-w-64 truncate text-xs text-muted-foreground">
          {userAgent || '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'metadata',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.metadata`)}
      />
    ),
    cell: ({ row }) => {
      const metadata = row.getValue<Record<string, unknown>>('metadata');
      return (
        <div className="max-w-32 truncate font-mono text-xs text-muted-foreground">
          {Object.keys(metadata || {}).length > 0
            ? JSON.stringify(metadata)
            : '-'}
        </div>
      );
    },
  },
];
