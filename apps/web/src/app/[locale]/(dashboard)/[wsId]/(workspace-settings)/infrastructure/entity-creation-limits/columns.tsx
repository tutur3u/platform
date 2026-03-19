'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { TableGroup } from './types';
import { TIER_ORDER } from './types';

export function useColumns(
  onEdit: (group: TableGroup) => void
): ColumnDef<TableGroup>[] {
  const t = useTranslations('entity-creation-limits');

  return [
    {
      accessorKey: 'tableName',
      header: () => t('fields.table_name'),
      cell: ({ row }) => (
        <span className="font-medium font-mono">{row.original.tableName}</span>
      ),
    },
    {
      id: 'tiers',
      header: () => t('section.tier_limits'),
      cell: ({ row }) => {
        const { tiers } = row.original;
        const enabledTierKeys = new Set(
          tiers.filter((r) => r.enabled).map((r) => r.tier)
        );

        return (
          <div className="flex flex-wrap gap-1">
            {TIER_ORDER.map((tier) => {
              const tierRow = tiers.find((r) => r.tier === tier);

              if (!tierRow) return null;

              return (
                <Badge
                  key={tier}
                  variant={enabledTierKeys.has(tier) ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {t(`tiers.${tier}`)}
                </Badge>
              );
            })}
          </div>
        );
      },
    },
    {
      id: 'notes',
      header: () => t('fields.notes'),
      cell: ({ row }) => {
        const notes = row.original.metadata.notes;

        return notes ? (
          <span className="line-clamp-2 text-muted-foreground text-sm">
            {notes}
          </span>
        ) : (
          <Badge variant="outline">{t('notes.empty')}</Badge>
        );
      },
    },
    {
      id: 'updated_at',
      header: () => (
        <span className="whitespace-nowrap">
          {t('configured_table.updated_label')}
        </span>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground text-xs">
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(row.original.metadata.updated_at))}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(row.original)}
          >
            {t('actions.edit')}
          </Button>
        </div>
      ),
    },
  ];
}
