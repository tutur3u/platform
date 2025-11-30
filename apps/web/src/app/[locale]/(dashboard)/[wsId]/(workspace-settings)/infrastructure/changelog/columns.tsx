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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  version: string | null;
  is_published: boolean;
  published_at: string | null;
  creator_id: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

const categoryConfig: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  feature: {
    label: 'Feature',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    className: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  },
  improvement: {
    label: 'Improvement',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    className: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  },
  bugfix: {
    label: 'Bug Fix',
    icon: <Bug className="h-3.5 w-3.5" />,
    className:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  },
  breaking: {
    label: 'Breaking',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    className: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  },
  security: {
    label: 'Security',
    icon: <Shield className="h-3.5 w-3.5" />,
    className:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
  },
  performance: {
    label: 'Performance',
    icon: <Zap className="h-3.5 w-3.5" />,
    className: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
  },
};

function EditButton({ id }: { id: string }) {
  const params = useParams();
  const wsId = params?.wsId as string;

  return (
    <Link href={`/${wsId}/infrastructure/changelog/${id}`}>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <Pencil className="h-4 w-4" />
      </Button>
    </Link>
  );
}

export const changelogColumns = (
  t: any,
  _namespace?: string
): ColumnDef<ChangelogEntry>[] => [
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
      const config = categoryConfig[category] || {
        label: category,
        icon: null,
        className: 'bg-muted text-muted-foreground',
      };

      return (
        <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
          {config.icon}
          {config.label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
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
          v{version}
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
      const isPublished = row.getValue('is_published') as boolean;
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
    cell: ({ row }) => {
      const date = row.getValue('published_at') as string | null;
      if (!date) {
        return <span className="text-muted-foreground">-</span>;
      }
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
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Created" />
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
    cell: ({ row }) => {
      return <EditButton id={row.original.id} />;
    },
  },
];
