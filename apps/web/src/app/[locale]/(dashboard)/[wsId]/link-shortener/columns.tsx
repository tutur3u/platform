'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { Tables } from '@tuturuuu/types/supabase';
import { Button } from '@tuturuuu/ui/button';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Copy, ExternalLink } from '@tuturuuu/ui/icons';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type ShortenedLink = Tables<'shortened_links'> & {
  href?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: <translation function is not typed>
const copyToClipboard = async (text: string, t: any) => {
  try {
    await navigator.clipboard.writeText(text);
    toast({
      title: t('link-shortener.copied_to_clipboard'),
      description: 'The shortened URL has been copied to your clipboard.', // TODO: Add translation
    });
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    toast({
      title: t('link-shortener.copy_failed'),
      description: 'Failed to copy to clipboard. Please copy manually.', // TODO: Add translation
      variant: 'destructive',
    });
  }
};

// Component to handle the short URL display and avoid hydration mismatch
// biome-ignore lint/suspicious/noExplicitAny: <translation function is not typed>
function ShortUrlDisplay({ slug, t }: { slug: string; t: any }) {
  const [fullUrl, setFullUrl] = useState(`/${slug}`);

  useEffect(() => {
    setFullUrl(`${window.location.origin}/${slug}`);
  }, [slug]);

  return (
    <div className="flex items-center gap-2">
      <Link
        href={
          process.env.NODE_ENV === 'development'
            ? `http://localhost:3002/${slug}`
            : `${process.env.NEXT_PUBLIC_SHORTENER_URL || ''}/${slug}`
        }
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm text-dynamic-blue hover:underline"
      >
        {process.env.NODE_ENV === 'development'
          ? `http://localhost:3002/${slug}`
          : `${process.env.NEXT_PUBLIC_SHORTENER_URL || ''}/${slug}`}
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => copyToClipboard(fullUrl, t)}
        className="h-6 w-6 p-0"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

export const linkShortenerColumns = (
  // biome-ignore lint/suspicious/noExplicitAny: <translation function is not typed>
  t: any,
  namespace: string | undefined
): ColumnDef<ShortenedLink>[] => [
  {
    accessorKey: 'slug',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.short_url`)}
      />
    ),
    cell: ({ row }) => <ShortUrlDisplay slug={row.getValue('slug')} t={t} />,
  },
  {
    accessorKey: 'link',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.original_url`)}
      />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="max-w-96 truncate text-sm">{row.getValue('link')}</div>
        <Link
          href={row.getValue('link')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    ),
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
      <div className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(row.getValue('created_at')), {
          addSuffix: true,
        })}
      </div>
    ),
  },
];
