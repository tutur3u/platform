'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Store } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

interface StorefrontListing {
  id: string;
  price: number;
  productId: string | null;
  status: string;
  title: string;
}
interface StorefrontOverview {
  listings: StorefrontListing[];
  storefront: {
    currency: string;
    id: string;
    name: string;
    slug: string;
    status: string;
    visibility: string;
  } | null;
}
interface CommerceProduct {
  id: string;
  name: string;
  price: number | null;
  stock: number;
}

const numberFormatter = new Intl.NumberFormat();

function buildStorefrontUrl(slug: string) {
  if (typeof window === 'undefined') return '#';
  const host = window.location.host.replace(/^cms\./, 'storefront.');
  return `${window.location.protocol}//${host}/store/${slug}`;
}

export function CmsStorefrontClient({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('external-projects');
  const queryClient = useQueryClient();

  const storefrontQuery = useQuery({
    queryFn: async (): Promise<StorefrontOverview | null> => {
      const response = await fetch(
        `/api/v1/commerce/storefront?wsId=${encodeURIComponent(workspaceId)}`,
        { cache: 'no-store' }
      );
      return response.ok ? response.json() : null;
    },
    queryKey: ['cms-storefront', workspaceId],
    retry: false,
    staleTime: 30_000,
  });

  const productsQuery = useQuery({
    queryFn: async (): Promise<CommerceProduct[]> => {
      const response = await fetch(
        `/api/v1/commerce/products?wsId=${encodeURIComponent(workspaceId)}`,
        { cache: 'no-store' }
      );
      return response.ok ? response.json() : [];
    },
    queryKey: ['cms-commerce-products', workspaceId],
    retry: false,
    staleTime: 60_000,
  });

  const publishMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await fetch('/api/v1/commerce/storefront', {
        body: JSON.stringify({ productId, wsId: workspaceId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to publish');
      }
    },
    onSuccess: () => {
      toast.success(t('epm.storefront_published_toast'));
      queryClient.invalidateQueries({
        queryKey: ['cms-storefront', workspaceId],
      });
    },
  });

  if (storefrontQuery.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const overview = storefrontQuery.data;
  const storefront = overview?.storefront ?? null;
  const listings = overview?.listings ?? [];
  const listedProductIds = new Set(
    listings.map((listing) => listing.productId).filter(Boolean)
  );
  const publishable = (productsQuery.data ?? []).filter(
    (product) => !listedProductIds.has(product.id)
  );

  if (!storefront) {
    return (
      <main className="space-y-5 pb-8">
        <section className="flex flex-col items-center justify-center rounded-lg border border-border/70 border-dashed bg-card/40 px-6 py-16 text-center">
          <Store className="h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">
            {t('epm.storefront_no_storefront_title')}
          </h2>
          <p className="mt-1 max-w-sm text-muted-foreground text-sm leading-6">
            {t('epm.storefront_no_storefront_description')}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-5 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/75 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-semibold text-2xl">{storefront.name}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
              {t('epm.storefront_description')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md capitalize">
                {storefront.status}
              </Badge>
              <Badge variant="outline" className="rounded-md capitalize">
                {storefront.visibility}
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {storefront.currency}
              </Badge>
            </div>
          </div>
          <Button asChild variant="outline">
            <a
              href={buildStorefrontUrl(storefront.slug)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('epm.storefront_open_action')}
            </a>
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75">
        <div className="border-border/70 border-b px-4 py-3">
          <h2 className="font-semibold">
            {t('epm.storefront_listings_title')}
          </h2>
        </div>
        {listings.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm">
            {t('epm.storefront_empty_listings')}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {listings.map((listing) => (
              <li
                key={listing.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="truncate font-medium text-sm">
                  {listing.title}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {numberFormatter.format(listing.price)}
                  </span>
                  <Badge variant="secondary" className="rounded-md capitalize">
                    {listing.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75">
        <div className="border-border/70 border-b px-4 py-3">
          <h2 className="font-semibold">{t('epm.storefront_publish_title')}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('epm.storefront_publish_description')}
          </p>
        </div>
        {publishable.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm">
            {t('epm.storefront_all_published')}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {publishable.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {product.name}
                  </span>
                  {product.price != null ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {numberFormatter.format(product.price)}
                    </span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={publishMutation.isPending}
                  onClick={() => publishMutation.mutate(product.id)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('epm.storefront_publish_action')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
