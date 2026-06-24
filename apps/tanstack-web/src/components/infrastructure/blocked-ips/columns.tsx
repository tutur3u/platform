'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Shield, ShieldAlert, ShieldCheck } from '@tuturuuu/icons';
import type {
  BlockedIpEntry,
  BlockedIpReason,
  BlockedIpStatus,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import {
  type BlockedIpRowActionHandlers,
  BlockedIpRowActions,
} from './row-actions';

const TRANSLATED_REASONS = new Set<BlockedIpReason>([
  'manual',
  'mfa_challenge',
  'mfa_verify_failed',
  'otp_send',
  'otp_verify_failed',
  'password_login_failed',
  'reauth_send',
  'reauth_verify_failed',
]);

function getExtraData(extraData: unknown): BlockedIpRowActionHandlers {
  return extraData as BlockedIpRowActionHandlers;
}

function formatTimestamp(value: string | null) {
  return value ? moment(value).format('DD/MM/YYYY, HH:mm:ss') : '-';
}

function getStatusBadge(status: BlockedIpStatus, t: (key: string) => string) {
  switch (status) {
    case 'active':
      return (
        <Badge className="flex items-center gap-1" variant="destructive">
          <ShieldAlert className="h-3 w-3" />
          {t('blocked-ips.status_active')}
        </Badge>
      );
    case 'expired':
      return (
        <Badge className="flex items-center gap-1" variant="secondary">
          <Clock className="h-3 w-3" />
          {t('blocked-ips.status_expired')}
        </Badge>
      );
    case 'manually_unblocked':
      return (
        <Badge className="flex items-center gap-1" variant="outline">
          <ShieldCheck className="h-3 w-3" />
          {t('blocked-ips.status_unblocked')}
        </Badge>
      );
  }
}

function getBlockLevelBadge(level: number, t: (key: string) => string) {
  if (level === 0) {
    return <Badge variant="outline">{t('blocked-ips.level_permanent')}</Badge>;
  }

  const durationByLevel: Record<number, string> = {
    1: '5 min',
    2: '15 min',
    3: '1 hour',
    4: '24 hours',
  };

  return (
    <Badge variant={level >= 3 ? 'destructive' : 'secondary'}>
      Level {level} ({durationByLevel[level] || 'unknown'})
    </Badge>
  );
}

function getReasonLabel(reason: BlockedIpReason, t: (key: string) => string) {
  if (TRANSLATED_REASONS.has(reason)) {
    return t(`blocked-ips.reason_${reason}`);
  }

  return reason.replace(/_/gu, ' ');
}

export const getBlockedIpsColumns = ({
  extraData,
  namespace,
  t,
}: ColumnGeneratorOptions<BlockedIpEntry>): ColumnDef<BlockedIpEntry>[] => {
  const actionHandlers = getExtraData(extraData);

  return [
    {
      accessorKey: 'id',
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-32 font-mono text-xs">
          {row.original.id}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.id`)}
        />
      ),
    },
    {
      accessorKey: 'ip_address',
      cell: ({ row }) => {
        const ipAddress = row.original.ip_address;

        return (
          <div className="flex items-center gap-2 font-mono text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            {ipAddress === '::1' ? 'localhost' : ipAddress}
          </div>
        );
      },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.ip_address`)}
        />
      ),
    },
    {
      accessorKey: 'status',
      cell: ({ row }) => getStatusBadge(row.original.status, t),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.status`)}
        />
      ),
    },
    {
      accessorKey: 'block_level',
      cell: ({ row }) => getBlockLevelBadge(row.original.block_level, t),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.block_level`)}
        />
      ),
    },
    {
      accessorKey: 'reason',
      cell: ({ row }) => (
        <div className="text-sm">{getReasonLabel(row.original.reason, t)}</div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.reason`)}
        />
      ),
    },
    {
      accessorKey: 'blocked_at',
      cell: ({ row }) => (
        <div className="text-sm">
          {formatTimestamp(row.original.blocked_at)}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.blocked_at`)}
        />
      ),
    },
    {
      accessorKey: 'expires_at',
      cell: ({ row }) => {
        const expiresAt = row.original.expires_at;
        const isExpired = expiresAt && new Date(expiresAt) < new Date();

        return (
          <div
            className={`text-sm ${isExpired ? 'text-muted-foreground' : ''}`}
          >
            {formatTimestamp(expiresAt)}
          </div>
        );
      },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.expires_at`)}
        />
      ),
    },
    {
      accessorKey: 'unblocked_by',
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-32 text-sm">
          {row.original.unblocked_by_user?.display_name || '-'}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.unblocked_by`)}
        />
      ),
    },
    {
      accessorKey: 'metadata',
      cell: ({ row }) => {
        const metadata = row.original.metadata;

        return (
          <div className="max-w-32 truncate font-mono text-muted-foreground text-xs">
            {metadata && Object.keys(metadata).length > 0
              ? JSON.stringify(metadata)
              : '-'}
          </div>
        );
      },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.metadata`)}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      cell: ({ row }) => (
        <div className="text-sm">
          {formatTimestamp(row.original.created_at)}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.created_at`)}
        />
      ),
    },
    {
      accessorKey: 'updated_at',
      cell: ({ row }) => (
        <div className="text-sm">
          {formatTimestamp(row.original.updated_at)}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.updated_at`)}
        />
      ),
    },
    {
      cell: ({ row }) => (
        <BlockedIpRowActions row={row.original} {...actionHandlers} />
      ),
      header: ({ column }) => <DataTableColumnHeader column={column} t={t} />,
      id: 'actions',
    },
  ];
};
