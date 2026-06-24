'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Bug,
  Check,
  Pencil,
  Shield,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { BackendInfrastructureChangelogEntry } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import type { ReactNode } from 'react';

type ChangelogColumnsExtraData = {
  wsId: string;
};

const categoryConfig: Record<
  string,
  {
    className: string;
    icon: ReactNode;
    label: string;
  }
> = {
  breaking: {
    className: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: 'Breaking',
  },
  bugfix: {
    className:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
    icon: <Bug className="h-3.5 w-3.5" />,
    label: 'Bug Fix',
  },
  feature: {
    className: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    label: 'Feature',
  },
  improvement: {
    className: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    label: 'Improvement',
  },
  performance: {
    className: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
    icon: <Zap className="h-3.5 w-3.5" />,
    label: 'Performance',
  },
  security: {
    className:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
    icon: <Shield className="h-3.5 w-3.5" />,
    label: 'Security',
  },
};

function formatDateParts(value: string | null) {
  if (!value) {
    return null;
  }

  const date = moment(value);
  if (!date.isValid()) {
    return null;
  }

  return {
    date: date.format('MMM DD, YYYY'),
    time: date.format('HH:mm'),
  };
}

function DateCell({ value }: { value: string | null }) {
  const parts = formatDateParts(value);

  if (!parts) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm">{parts.date}</span>
      <span className="text-muted-foreground text-xs">{parts.time}</span>
    </div>
  );
}

export const changelogColumns = ({
  extraData,
  t,
}: ColumnGeneratorOptions<BackendInfrastructureChangelogEntry>): ColumnDef<BackendInfrastructureChangelogEntry>[] => {
  const { wsId } = (extraData ?? {}) as Partial<ChangelogColumnsExtraData>;

  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="ID" />
      ),
    },
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Title" />
      ),
      cell: ({ row }) => {
        const entry = row.original;

        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{entry.title}</span>
            <span className="text-muted-foreground text-xs">/{entry.slug}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'category',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Category" />
      ),
      cell: ({ row }) => {
        const category = row.getValue('category') as string;
        const config = categoryConfig[category] ?? {
          className: 'bg-muted text-muted-foreground',
          icon: null,
          label: category,
        };

        return (
          <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
            {config.icon}
            {config.label}
          </Badge>
        );
      },
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'version',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Version" />
      ),
      cell: ({ row }) => {
        const version = row.getValue('version') as string | null;

        return version ? (
          <Badge variant="secondary" className="font-mono">
            {version}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'is_published',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const isPublished = row.getValue('is_published') as boolean | null;
        const publishedAt = row.original.published_at;

        return isPublished && publishedAt ? (
          <Badge
            variant="outline"
            className="gap-1.5 border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
          >
            <Check className="h-3.5 w-3.5" />
            Published
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1.5 border-muted bg-muted/50 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Draft
          </Badge>
        );
      },
    },
    {
      accessorKey: 'published_at',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Published" />
      ),
      cell: ({ row }) => (
        <DateCell value={row.getValue('published_at') as string | null} />
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Created" />
      ),
      cell: ({ row }) => (
        <DateCell value={row.getValue('created_at') as string | null} />
      ),
    },
    {
      accessorKey: 'creator_id',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Creator" />
      ),
      cell: ({ row }) => {
        const creatorName = row.original.creator_name;

        return (
          <span className="text-sm">
            {creatorName || (
              <span className="text-muted-foreground">Unknown</span>
            )}
          </span>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) =>
        wsId ? (
          <Link href={`/${wsId}/infrastructure/changelog/${row.original.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Pencil className="h-4 w-4" />
            </Button>
          </Link>
        ) : null,
    },
  ];
};
