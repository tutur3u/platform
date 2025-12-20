'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, Globe } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';

export default function UncrawledUrlsCount({ wsId }: { wsId: string }) {
  const {
    data: uncrawledCount,
    isLoading: loadingUncrawled,
    error: errorUncrawled,
  } = useQuery({
    queryKey: ['crawlers', wsId, 'uncrawled-count'],
    queryFn: async () => {
      const res = await fetch(`/api/${wsId}/crawlers/uncrawled?pageSize=1`);
      if (!res.ok) throw new Error('Failed to fetch data');
      return (await res.json()).pagination.totalItems as number;
    },
  });

  const {
    data: domainsCount,
    isLoading: loadingDomains,
    error: errorDomains,
  } = useQuery({
    queryKey: ['crawlers', wsId, 'domains'],
    queryFn: async () => {
      const res = await fetch(`/api/${wsId}/crawlers/domains`);
      if (!res.ok) throw new Error('Failed to fetch data');
      return ((await res.json()).domains || []).length as number;
    },
  });

  if (loadingUncrawled || loadingDomains) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (errorUncrawled || errorDomains) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {errorUncrawled?.message || errorDomains?.message || 'Unknown error occurred'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Link href={`/${wsId}/crawlers/uncrawled`} className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="grid grid-cols-2 gap-4 p-6">
          <div className="space-y-1">
            <p className="font-medium text-sm leading-none">Uncrawled URLs</p>
            <p className="font-bold text-2xl">{uncrawledCount}</p>
            <p className="text-muted-foreground text-xs">
              {uncrawledCount === 0
                ? 'All caught up!'
                : 'Waiting to be crawled'}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium text-sm leading-none">Domains</p>
            </div>
            <p className="font-bold text-2xl">{domainsCount}</p>
            <p className="text-muted-foreground text-xs">
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
