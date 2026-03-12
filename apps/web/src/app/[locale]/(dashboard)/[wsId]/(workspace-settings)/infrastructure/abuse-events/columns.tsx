'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle, Shield, XCircle } from '@tuturuuu/icons';
import type { AbuseEvent as AbuseEventRow } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';

export type AbuseEventType =
  | 'otp_send'
  | 'otp_verify_failed'
  | 'mfa_challenge'
  | 'mfa_verify_failed'
  | 'reauth_send'
  | 'reauth_verify_failed'
  | 'password_login_failed'
  | 'api_auth_failed'
  | 'api_rate_limited'
  | 'api_abuse'
  | 'manual';

export type AbuseEventEntry = Pick<
  AbuseEventRow,
  | 'id'
  | 'ip_address'
  | 'event_type'
  | 'email'
  | 'email_hash'
  | 'user_agent'
  | 'endpoint'
  | 'success'
  | 'metadata'
  | 'created_at'
>;

const getEventTypeBadge = (eventType: string) => {
  const colors: Record<string, string> = {
    otp_send: 'bg-dynamic-blue/10 text-dynamic-blue',
    otp_verify_failed: 'bg-dynamic-red/10 text-dynamic-red',
    mfa_challenge: 'bg-dynamic-purple/10 text-dynamic-purple',
    mfa_verify_failed: 'bg-dynamic-red/10 text-dynamic-red',
    reauth_send: 'bg-dynamic-blue/10 text-dynamic-blue',
    reauth_verify_failed: 'bg-dynamic-red/10 text-dynamic-red',
    password_login_failed: 'bg-dynamic-orange/10 text-dynamic-orange',
    api_auth_failed: 'bg-dynamic-red/10 text-dynamic-red',
    api_rate_limited: 'bg-dynamic-yellow/10 text-dynamic-yellow',
    api_abuse: 'bg-dynamic-red/10 text-dynamic-red',
  };

  const labels: Record<string, string> = {
    otp_send: 'OTP Send',
    otp_verify_failed: 'OTP Verify Failed',
    mfa_challenge: 'MFA Challenge',
    mfa_verify_failed: 'MFA Verify Failed',
    reauth_send: 'Reauth Send',
    reauth_verify_failed: 'Reauth Verify Failed',
    password_login_failed: 'Password Login Failed',
    api_auth_failed: 'API Auth Failed',
    api_rate_limited: 'API Rate Limited',
    api_abuse: 'API Abuse',
  };

  return (
    <Badge className={colors[eventType] || ''}>
      {labels[eventType] || eventType}
    </Badge>
  );
};

export const getAbuseEventsColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<AbuseEventEntry>): ColumnDef<AbuseEventEntry>[] => [
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
    cell: ({ row }) => {
      const ip = row.getValue('ip_address') as string;
      return (
        <div className="flex items-center gap-2 font-mono text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          {ip === '::1' ? 'localhost' : ip}
        </div>
      );
    },
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
              <CheckCircle className="h-4 w-4 text-dynamic-green" />
              <span className="text-dynamic-green text-sm">Success</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-dynamic-red" />
              <span className="text-dynamic-red text-sm">Failed</span>
            </>
          )}
        </div>
      );
    },
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
    cell: ({ row }) => {
      const email = row.getValue<string | null>('email');
      return (
        <div className="max-w-48 truncate font-mono text-xs">
          {email || '-'}
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
        <div className="max-w-24 truncate font-mono text-muted-foreground text-xs">
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
        <div className="max-w-64 truncate text-muted-foreground text-xs">
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
      const metadata = row.getValue('metadata') as Record<
        string,
        unknown
      > | null;
      return (
        <div className="max-w-32 truncate font-mono text-muted-foreground text-xs">
          {metadata && Object.keys(metadata).length > 0
            ? JSON.stringify(metadata)
            : '-'}
        </div>
      );
    },
  },
];
