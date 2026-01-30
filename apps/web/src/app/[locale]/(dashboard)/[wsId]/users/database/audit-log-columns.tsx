'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { format } from 'date-fns';

interface AuditLogEntry {
  id: string;
  user_id: string;
  ws_id: string;
  archived: boolean;
  archived_until: string | null;
  creator_id: string;
  created_at: string;
  user_full_name?: string | null;
  creator_full_name?: string | null;
}

export const getAuditLogColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<AuditLogEntry>): ColumnDef<AuditLogEntry>[] => [
  {
    accessorKey: 'id',
    header: t(`${namespace}.id`),
    cell: ({ row }) => (
      <div className="text-muted-foreground text-sm">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'user_full_name',
    header: t(`${namespace}.user_full_name`),
    cell: ({ row }) => (
      <div className="font-medium">
        {row.original.user_full_name || t(`${namespace}.unknown_user`)}
      </div>
    ),
  },
  {
    accessorKey: 'archived',
    header: t('common.status'),
    cell: ({ row }) => {
      const isArchived = row.getValue('archived');
      return (
        <div className="flex items-center gap-2">
          {isArchived ? (
            <>
              <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
              <span className="text-sm">{t(`${namespace}.archived`)}</span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-dynamic-green" />
              <span className="text-sm">{t(`${namespace}.active`)}</span>
            </>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'archived_until',
    header: t(`${namespace}.archived_until`),
    cell: ({ row }) => {
      const date = row.getValue('archived_until') as string | null;
      if (!date)
        return (
          <div className="text-muted-foreground text-sm">
            {t(`${namespace}.dash`)}
          </div>
        );
      try {
        return <div className="text-sm">{format(new Date(date), 'PPP p')}</div>;
      } catch {
        return (
          <div className="text-muted-foreground text-sm">
            {t(`${namespace}.invalid_date`)}
          </div>
        );
      }
    },
  },
  {
    accessorKey: 'creator_full_name',
    header: t(`${namespace}.creator_full_name`),
    cell: ({ row }) => (
      <div className="text-sm">
        {row.original.creator_full_name || t(`${namespace}.system`)}
      </div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: t(`${namespace}.created_at`),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      try {
        return (
          <div className="text-muted-foreground text-sm">
            {format(new Date(date), 'PPP p')}
          </div>
        );
      } catch {
        return (
          <div className="text-muted-foreground text-sm">
            {t(`${namespace}.invalid_date`)}
          </div>
        );
      }
    },
  },
];
