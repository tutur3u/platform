'use client';

import { Filter, Loader2, RotateCw, ScanSearch, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export default function CrawlerFilters({ wsId }: { wsId: string }) {
  const t = useTranslations();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [urlSearch, setUrlSearch] = useState(searchParams.get('search') || '');
  const currentDomain = searchParams.get('domain') || 'all';
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/${wsId}/crawlers/domains`);
      if (!res.ok) throw new Error('Failed to fetch domains');
      const data = await res.json();
      setDomains(data.domains);
    } catch (err) {
      console.error('Error fetching domains:', err);
      toast({
        variant: 'destructive',
        title: 'Failed to fetch domains',
        description: 'Please try again later',
      });
    } finally {
      setLoading(false);
    }
  }, [wsId, toast]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const refreshDomains = async () => {
    setRefreshing(true);
    await fetchDomains();
    setRefreshing(false);
    toast({
      title: 'Domains refreshed',
      description: `Found ${domains.length} unique domains`,
    });
  };

  const debouncedSearch = useDebouncedCallback((value: string) => {
    router.push(
      `${pathname}?${createQueryString({
        search: value || null,
        page: '1',
      })}`
    );
  }, 300);

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

  const comboboxOptions = [
    { value: 'all', label: 'All Domains' },
    ...domains.map((domain) => ({ value: domain, label: domain })),
  ];

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search URLs..."
          value={urlSearch}
          onChange={(e) => {
            setUrlSearch(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="w-[200px] pl-9"
        />
      </div>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
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
                domain: selectedValue === 'all' ? null : selectedValue || null,
                page: '1',
              })}`
            );
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={refreshDomains}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
        </Button>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          setUrlSearch('');
          router.push(pathname);
        }}
        className="gap-2"
      >
        <ScanSearch className="h-4 w-4" />
        Reset Filters
      </Button>
    </div>
  );
}
