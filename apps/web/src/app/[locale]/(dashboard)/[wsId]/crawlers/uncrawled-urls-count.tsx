'use client';

import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { AlertCircle, ArrowUpRight, Globe } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function UncrawledUrlsCount({ wsId }: { wsId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uncrawledCount, setUncrawledCount] = useState<number>(0);
  const [domainsCount, setDomainsCount] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [uncrawledRes, domainsRes] = await Promise.all([
          fetch(`/api/${wsId}/crawlers/uncrawled?pageSize=1`),
          fetch(`/api/${wsId}/crawlers/domains`),
        ]);

        if (!uncrawledRes.ok || !domainsRes.ok)
          throw new Error('Failed to fetch data');

        const uncrawledData = await uncrawledRes.json();
        const domainsData = await domainsRes.json();

        setUncrawledCount(uncrawledData.pagination.totalItems);
        setDomainsCount((domainsData.domains || []).length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [wsId]);

  if (loading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Link href={`/${wsId}/crawlers/uncrawled`} className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="grid grid-cols-2 gap-4 p-6">
          <div className="space-y-1">
            <p className="text-sm leading-none font-medium">Uncrawled URLs</p>
            <p className="text-2xl font-bold">{uncrawledCount}</p>
            <p className="text-xs text-muted-foreground">
              {uncrawledCount === 0
                ? 'All caught up!'
                : 'Waiting to be crawled'}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm leading-none font-medium">Domains</p>
            </div>
            <p className="text-2xl font-bold">{domainsCount}</p>
            <p className="text-xs text-muted-foreground">
              Unique domains discovered
            </p>
          </div>
          <div className="col-span-2 flex items-center justify-end">
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
