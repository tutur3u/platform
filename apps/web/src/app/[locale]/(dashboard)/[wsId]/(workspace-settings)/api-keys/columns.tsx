'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Copy } from '@tuturuuu/icons';
import type { WorkspaceApiKey } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import moment from 'moment';
import { useState } from 'react';
import { ApiKeyRowActions } from './row-actions';

// Separate component for key prefix cell to handle React hooks correctly
function KeyPrefixCell({ t, prefix }: { t: any; prefix: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (prefix) {
      await navigator.clipboard.writeText(prefix);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!prefix) return <span className="text-muted-foreground">-</span>;

  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-xs">{prefix}...</code>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleCopy}
        aria-label={t('ws-api-keys.copy_prefix')}
      >
        {copied ? (
          <Check className="h-3 w-3 text-dynamic-green" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

export const apiKeyColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<WorkspaceApiKey>): ColumnDef<WorkspaceApiKey>[] => [
  // {
  //   id: 'select',
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={table.getIsAllPageRowsSelected()}
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  // },
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
      <div className="line-clamp-1 max-w-32 break-all">
        {row.getValue('id') || '-'}
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
      <div className="font-medium">
        <div className="line-clamp-1">{row.getValue('name') || '-'}</div>
      </div>
    ),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.description_label`)}
      />
    ),
    cell: ({ row }) => {
      const description = row.original.description;
      if (!description) return <span className="text-muted-foreground">-</span>;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-48 cursor-help truncate text-muted-foreground text-sm">
              {description}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-80">
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'key_prefix',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.key_prefix`)}
      />
    ),
    cell: ({ row }) => {
      const prefix = row.getValue('key_prefix') as string | null;
      return <KeyPrefixCell t={t} prefix={prefix} />;
    },
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
      const expiresAt = row.original.expires_at;

      if (!expiresAt) {
        return (
          <Badge
            variant="outline"
            className="bg-dynamic-green/10 text-dynamic-green"
          >
            {t(`${namespace}.active`)}
          </Badge>
        );
      }

      const expiration = new Date(expiresAt);
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry < 0) {
        return (
          <Badge
            variant="outline"
            className="bg-dynamic-red/10 text-dynamic-red"
          >
            {t(`${namespace}.expired`)}
          </Badge>
        );
      }

      if (daysUntilExpiry <= 7) {
        return (
          <Badge
            variant="outline"
            className="bg-dynamic-orange/10 text-dynamic-orange"
          >
            {t(`${namespace}.expires_soon`)}
          </Badge>
        );
      }

      return (
        <Badge
          variant="outline"
          className="bg-dynamic-green/10 text-dynamic-green"
        >
          {t(`${namespace}.active`)}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'last_used_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.last_used`)}
      />
    ),
    cell: ({ row }) => {
      const lastUsed = row.getValue('last_used_at') as string | null;
      if (!lastUsed) {
        return (
          <span className="text-muted-foreground text-sm">
            {t(`${namespace}.never_used`)}
          </span>
        );
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-sm">
              {moment(lastUsed).fromNow()}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{moment(lastUsed).format('DD/MM/YYYY, HH:mm:ss')}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
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
      const expiresAt = row.getValue('expires_at') as string | null;
      if (!expiresAt) {
        return (
          <span className="text-muted-foreground text-sm">
            {t(`${namespace}.no_expiration`)}
          </span>
        );
      }
      const expiration = new Date(expiresAt);
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-sm">
              {daysUntilExpiry < 0
                ? t(`${namespace}.expired`)
                : t(`${namespace}.expires_in`, { days: daysUntilExpiry })}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{moment(expiresAt).format('DD/MM/YYYY, HH:mm:ss')}</p>
          </TooltipContent>
        </Tooltip>
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
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ApiKeyRowActions row={row} />,
  },
];
