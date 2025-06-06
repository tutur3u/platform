'use client';

import CrawlButton from '../../[crawlerId]/crawl-button';
import { Alert, AlertDescription } from '@ncthub/ui/alert';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { Combobox } from '@ncthub/ui/custom/combobox';
import { AlertCircle } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
} from '@ncthub/ui/pagination';
import { Skeleton } from '@ncthub/ui/skeleton';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface UncrawledUrl {
  created_at: string;
  origin_id: string;
  skipped: boolean;
  url: string;
}

interface PaginationData {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

export default function UncrawledUrls({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupedUrls, setGroupedUrls] = useState<
    Record<string, UncrawledUrl[]>
  >({});
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    pageSize: 20,
    totalPages: 1,
    totalItems: 0,
  });
  const [domains, setDomains] = useState<string[]>([]);
  const [urlSearch, setUrlSearch] = useState(searchParams.get('search') || '');

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentDomain = searchParams.get('domain') || 'all';
  const currentPageSize = Number(searchParams.get('pageSize')) || 20;

  const debouncedSearch = useDebouncedCallback((value: string) => {
    router.push(
      `${pathname}?${createQueryString({
        search: value || null,
        page: '1',
      })}`
    );
  }, 300);

  useEffect(() => {
    const fetchUncrawledUrls = async () => {
      try {
        // Fetch domains first
        const domainsRes = await fetch(`/api/${wsId}/crawlers/domains`);
        if (!domainsRes.ok) throw new Error('Failed to fetch domains');
        const domainsData = await domainsRes.json();
        setDomains(domainsData.domains || []);

        // Then fetch uncrawled URLs
        const queryParams = new URLSearchParams(searchParams);
        if (!queryParams.has('page')) queryParams.set('page', '1');
        if (!queryParams.has('pageSize')) queryParams.set('pageSize', '20');

        const res = await fetch(
          `/api/${wsId}/crawlers/uncrawled?${queryParams}`
        );
        if (!res.ok) throw new Error('Failed to fetch uncrawled URLs');

        const data = await res.json();
        setGroupedUrls(data.groupedUrls || {});
        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchUncrawledUrls();
  }, [wsId, searchParams]);

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });
    return newSearchParams.toString();
  };

  const pageSizeOptions = [
    { value: '10', label: '10 per page' },
    { value: '20', label: '20 per page' },
    { value: '50', label: '50 per page' },
    { value: '100', label: '100 per page' },
  ];

  const comboboxOptions = [
    { value: 'all', label: 'All Domains' },
    ...domains.map((domain) => ({ value: domain, label: domain })),
  ];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-48" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!pagination.totalItems) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uncrawled URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            All discovered URLs have been crawled!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Uncrawled URLs ({pagination.totalItems})</CardTitle>
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search URLs..."
            value={urlSearch}
            onChange={(e) => {
              setUrlSearch(e.target.value);
              debouncedSearch(e.target.value);
            }}
            className="w-[200px]"
          />
          <Combobox
            t={t}
            options={comboboxOptions}
            selected={currentDomain}
            mode="single"
            className="w-[300px]"
            placeholder={loading ? 'Loading domains...' : 'Filter by domain'}
            onChange={(value) => {
              const selectedValue = Array.isArray(value) ? value[0] : value;
              router.push(
                `${pathname}?${createQueryString({
                  domain: selectedValue
                    ? selectedValue === 'all'
                      ? null
                      : selectedValue
                    : null,
                  page: '1',
                })}`
              );
            }}
          />
          <Combobox
            t={t}
            options={pageSizeOptions}
            selected={currentPageSize.toString()}
            mode="single"
            className="w-[140px]"
            onChange={(value) => {
              const selectedValue = Array.isArray(value) ? value[0] : value;
              router.push(
                `${pathname}?${createQueryString({
                  pageSize: selectedValue || null,
                  page: '1',
                })}`
              );
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              setUrlSearch('');
              router.push(pathname);
            }}
          >
            Reset Filters
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(groupedUrls).length > 0 ? (
            <>
              <div className="divide-y rounded-md border bg-card">
                {Object.entries(groupedUrls).map(([originId, urls]) => (
                  <div key={originId} className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        From: {urls?.[0]?.url || 'Unknown URL'}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          urls.forEach((url) => {
                            fetch(`/api/v1/workspaces/${wsId}/crawl`, {
                              method: 'POST',
                              body: JSON.stringify({ url: url.url }),
                            });
                          });
                        }}
                      >
                        Crawl All ({urls.length})
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {urls?.map((url) => (
                        <div
                          key={url.url}
                          className="flex items-center justify-between rounded-md bg-muted/50 p-2"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="truncate text-sm">{url.url}</span>
                            <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">
                              {new URL(url.url).hostname}
                            </span>
                          </div>
                          <div className="shrink-0">
                            <CrawlButton wsId={wsId} url={url.url} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * currentPageSize + 1} to{' '}
                  {Math.min(
                    currentPage * currentPageSize,
                    pagination.totalItems
                  )}{' '}
                  of {pagination.totalItems} results
                </p>
                <Pagination>
                  <PaginationContent>
                    {[...Array(pagination.totalPages)].map((_, i) => {
                      const page = i + 1;
                      const shouldShowPage =
                        page === 1 ||
                        page === pagination.totalPages ||
                        (page >= currentPage - 2 && page <= currentPage + 2);

                      if (!shouldShowPage) {
                        if (
                          (page === 2 && currentPage - 2 > 2) ||
                          (page === pagination.totalPages - 1 &&
                            currentPage + 2 < pagination.totalPages - 1)
                        ) {
                          return (
                            <PaginationItem key={page}>
                              <span className="flex size-9 items-center justify-center">
                                ...
                              </span>
                            </PaginationItem>
                          );
                        }
                        return null;
                      }

                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href={`${pathname}?${createQueryString({
                              page: String(page),
                            })}`}
                            isActive={currentPage === page}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        href={`${pathname}?${createQueryString({
                          page: String(currentPage + 1),
                        })}`}
                        aria-disabled={currentPage >= pagination.totalPages}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          ) : (
            !loading && (
              <p className="text-center text-muted-foreground">
                No uncrawled URLs found
              </p>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
