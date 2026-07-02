'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';

export interface OtpLimitResetHistoryEntry {
  id: string;
  created_at: string;
  email: string | null;
  ip_address: string;
  metadata: Record<string, unknown> | null;
  admin_display_name?: string | null;
}

function readBoolean(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  return metadata?.[key] === true;
}

function readNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : 0;
}

function readString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function getResetScopeBadges(metadata: Record<string, unknown> | null) {
  const scopes = [
    readBoolean(metadata, 'clearEmailScoped') && 'Email',
    readBoolean(metadata, 'clearRelatedIpCounters') && 'IP Counters',
    readBoolean(metadata, 'clearRelatedIpBlocks') && 'IP Blocks',
  ].filter((value): value is string => !!value);

  if (scopes.length === 0) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <Badge key={scope} variant="secondary">
          {scope}
        </Badge>
      ))}
    </div>
  );
}

export const getOtpLimitResetColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<OtpLimitResetHistoryEntry>): ColumnDef<OtpLimitResetHistoryEntry>[] => [
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
        {moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')}
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
      <div className="max-w-64 truncate font-mono text-xs">
        {row.getValue<string | null>('email') || '-'}
      </div>
    ),
  },
  {
    id: 'scope',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.scope`)}
      />
    ),
    cell: ({ row }) => getResetScopeBadges(row.original.metadata),
  },
  {
    id: 'related_ip_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.related_ip_count`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-sm">
        {readNumber(row.original.metadata, 'related_ips_count')}
      </div>
    ),
  },
  {
    id: 'unblocked_ip_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.unblocked_ip_count`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-sm">
        {readNumber(row.original.metadata, 'unblocked_ip_count')}
      </div>
    ),
  },
  {
    id: 'admin_display_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.admin`)}
      />
    ),
    cell: ({ row }) => (
      <div className="max-w-40 truncate text-sm">
        {row.original.admin_display_name || '-'}
      </div>
    ),
  },
  {
    id: 'reason',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.reason`)}
      />
    ),
    cell: ({ row }) => (
      <div className="max-w-md whitespace-pre-wrap text-sm">
        {readString(row.original.metadata, 'reason') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'ip_address',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.admin_ip`)}
      />
    ),
    cell: ({ row }) => (
      <div className="max-w-40 truncate font-mono text-xs">
        {row.getValue<string>('ip_address') || '-'}
      </div>
    ),
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
    cell: ({ row }) => (
      <pre className="max-w-xl overflow-x-auto rounded-md bg-muted p-2 text-xs">
        {JSON.stringify(row.original.metadata || {}, null, 2)}
      </pre>
    ),
  },
];
