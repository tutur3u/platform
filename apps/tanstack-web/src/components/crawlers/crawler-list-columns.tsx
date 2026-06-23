'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, ExternalLink, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import type { CrawledUrlReadModel, CrawlerReadOnlyLabels } from './types';
import { formatDateTime } from './utils';

type CrawlerColumnExtraData = {
  labels: CrawlerReadOnlyLabels;
  locale: string;
};

export function getCrawlerListColumns({
  extraData,
  namespace,
  t,
}: ColumnGeneratorOptions<CrawledUrlReadModel>): ColumnDef<CrawledUrlReadModel>[] {
  const { labels, locale } = extraData as CrawlerColumnExtraData;

  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-40 font-mono text-muted-foreground text-xs">
          {row.getValue('id')}
        </div>
      ),
    },
    {
      accessorKey: 'url',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.url`)}
        />
      ),
      cell: ({ row }) => {
        const url = row.getValue<string | null>('url');

        if (!url) {
          return <span className="text-muted-foreground">-</span>;
        }

        return (
          <a
            className="flex min-w-56 items-center gap-2 font-medium hover:underline"
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            <span className="line-clamp-1">{url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
        );
      },
    },
    {
      accessorKey: 'html',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.html`)}
        />
      ),
      cell: ({ row }) => (
        <CrawlerAvailabilityBadge
          available={Boolean(row.getValue('html'))}
          availableLabel={labels.status.hasHtml}
          missingLabel={labels.status.missingHtml}
        />
      ),
    },
    {
      accessorKey: 'markdown',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.markdown`)}
        />
      ),
      cell: ({ row }) => (
        <CrawlerAvailabilityBadge
          available={Boolean(row.getValue('markdown'))}
          availableLabel={labels.status.hasMarkdown}
          missingLabel={labels.status.missingMarkdown}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.created_at`)}
        />
      ),
      cell: ({ row }) => (
        <time className="whitespace-nowrap text-sm">
          {formatDateTime(row.getValue('created_at'), locale)}
        </time>
      ),
    },
  ];
}

function CrawlerAvailabilityBadge({
  available,
  availableLabel,
  missingLabel,
}: {
  available: boolean;
  availableLabel: string;
  missingLabel: string;
}) {
  return (
    <Badge
      className={
        available
          ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green'
          : 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red'
      }
      variant="outline"
    >
      {available ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      {available ? availableLabel : missingLabel}
    </Badge>
  );
}
