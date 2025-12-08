'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Shield, ShieldAlert, ShieldCheck, Clock } from '@tuturuuu/icons';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Badge } from '@tuturuuu/ui/badge';
import moment from 'moment';
import { BlockedIPRowActions } from './row-actions';

export interface BlockedIPEntry {
  id: string;
  ip_address: string;
  reason: string;
  block_level: number;
  status: 'active' | 'expired' | 'manually_unblocked';
  blocked_at: string;
  expires_at: string;
  unblocked_at?: string | null;
  unblocked_by?: string | null;
  unblock_reason?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  unblocked_by_user?: {
    id: string;
    display_name: string | null;
  } | null;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" />
          Active
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Expired
        </Badge>
      );
    case 'manually_unblocked':
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          Unblocked
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const getBlockLevelBadge = (level: number) => {
  const colors: Record<number, string> = {
    1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    2: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    3: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    4: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };

  const durations: Record<number, string> = {
    1: '5 min',
    2: '15 min',
    3: '1 hour',
    4: '24 hours',
  };

  return (
    <Badge className={colors[level] || ''}>
      Level {level} ({durations[level] || 'unknown'})
    </Badge>
  );
};

const getReasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    otp_send: 'OTP Send Abuse',
    otp_verify_failed: 'OTP Verify Failures',
    mfa_challenge: 'MFA Challenge Abuse',
    mfa_verify_failed: 'MFA Verify Failures',
    reauth_send: 'Reauth Send Abuse',
    reauth_verify_failed: 'Reauth Verify Failures',
    password_login_failed: 'Password Login Failures',
  };
  return labels[reason] || reason;
};

export const getBlockedIPsColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<BlockedIPEntry>[] => [
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
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => getStatusBadge(row.getValue('status')),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'block_level',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.block_level`)}
      />
    ),
    cell: ({ row }) => getBlockLevelBadge(row.getValue('block_level')),
  },
  {
    accessorKey: 'reason',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.reason`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-sm">{getReasonLabel(row.getValue('reason'))}</div>
    ),
  },
  {
    accessorKey: 'blocked_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.blocked_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-sm">
        {row.getValue('blocked_at')
          ? moment(row.getValue('blocked_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'expires_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.expires_at`)}
      />
    ),
    cell: ({ row }) => {
      const expiresAt = row.getValue<string>('expires_at');
      const isExpired = expiresAt && new Date(expiresAt) < new Date();
      return (
        <div className={`text-sm ${isExpired ? 'text-muted-foreground' : ''}`}>
          {expiresAt ? moment(expiresAt).format('DD/MM/YYYY, HH:mm:ss') : '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'unblocked_by',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.unblocked_by`)}
      />
    ),
    cell: ({ row }) => {
      const userData = row.original.unblocked_by_user;
      return (
        <div className="line-clamp-1 max-w-32 text-sm">
          {userData?.display_name || '-'}
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
        {row.getValue('updated_at')
          ? moment(row.getValue('updated_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <BlockedIPRowActions row={row} />,
  },
];
