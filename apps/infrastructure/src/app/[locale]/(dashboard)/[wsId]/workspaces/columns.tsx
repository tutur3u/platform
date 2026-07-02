'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Key, Shield, User, Users } from '@tuturuuu/icons';
import type { WorkspaceOverviewRow } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';

function getTierBadge(tier: string | null) {
  if (!tier) return null;
  const config: Record<string, string> = {
    ENTERPRISE:
      'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/30',
    PRO: 'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/30',
    PLUS: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30',
    FREE: 'bg-secondary text-secondary-foreground border-border',
  };
  return (
    <Badge variant="outline" className={config[tier] || ''}>
      {tier}
    </Badge>
  );
}

function getStatusBadge(status: string) {
  const config: Record<string, string> = {
    active: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30',
    trialing:
      'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/30',
    past_due: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/30',
    canceled:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/30',
    unpaid: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/30',
    incomplete:
      'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/30',
    incomplete_expired: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge
      key={status}
      variant="outline"
      className={config[status] || 'bg-secondary text-secondary-foreground'}
    >
      {status.replace('_', ' ')}
    </Badge>
  );
}

export const workspaceOverviewColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<WorkspaceOverviewRow>): ColumnDef<WorkspaceOverviewRow>[] => [
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
      <span className="font-mono text-xs">
        {(row.getValue('id') as string).slice(0, 8)}
      </span>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_name`)}
      />
    ),
    cell: ({ row }) => {
      const name = row.getValue('name') as string | null;
      const personal = row.original.personal;
      return (
        <div className="flex items-center gap-2">
          {personal ? (
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-semibold">{name || '—'}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'handle',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_handle`)}
      />
    ),
    cell: ({ row }) => {
      const handle = row.getValue('handle') as string | null;
      return handle ? (
        <span className="font-medium text-dynamic-purple">@{handle}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'creator_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_creator_name`)}
      />
    ),
    cell: ({ row }) => {
      const name = row.getValue('creator_name') as string | null;
      return name ? (
        <span className="text-sm">{name}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'creator_email',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_creator_email`)}
      />
    ),
    cell: ({ row }) => {
      const email = row.getValue('creator_email') as string | null;
      return email ? (
        <span className="font-mono text-xs">{email}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'member_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_members`)}
      />
    ),
    cell: ({ row }) => {
      const count = row.getValue('member_count') as number;
      return (
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{count}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'highest_tier',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_plan`)}
      />
    ),
    cell: ({ row }) => {
      const tier = row.getValue('highest_tier') as string | null;
      return (
        getTierBadge(tier) || (
          <span className="text-muted-foreground text-xs">—</span>
        )
      );
    },
  },
  {
    accessorKey: 'subscription_statuses',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_status`)}
      />
    ),
    cell: ({ row }) => {
      const statuses = row.getValue('subscription_statuses') as string[];
      if (!statuses || statuses.length === 0) {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => getStatusBadge(s))}
        </div>
      );
    },
  },
  {
    accessorKey: 'active_subscription_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_active_subs`)}
      />
    ),
    cell: ({ row }) => {
      const count = row.getValue('active_subscription_count') as number;
      if (count > 1) {
        return (
          <Badge
            variant="outline"
            className="border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow"
          >
            {count}
          </Badge>
        );
      }
      return <span>{count}</span>;
    },
  },
  {
    accessorKey: 'role_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_roles`)}
      />
    ),
    cell: ({ row }) => {
      const count = row.getValue('role_count') as number;
      return (
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{count}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'secret_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_secrets`)}
      />
    ),
    cell: ({ row }) => {
      const count = row.getValue('secret_count') as number;
      return (
        <div className="flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{count}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'personal',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.col_type`)}
      />
    ),
    cell: ({ row }) => {
      const personal = row.getValue('personal') as boolean;
      return (
        <Badge variant={personal ? 'secondary' : 'outline'}>
          {personal ? t(`${namespace}.personal`) : t(`${namespace}.team`)}
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
        title={t(`${namespace}.col_created_at`)}
      />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{moment(date).format('MMM DD, YYYY')}</span>
          <span className="text-muted-foreground text-xs">
            {moment(date).format('HH:mm')}
          </span>
        </div>
      );
    },
  },
];
