'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from '@tuturuuu/icons';
import {
  getInventoryStorefront,
  listInventoryStorefrontListings,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  type StorefrontCartLine,
  StorefrontSurface,
  type StorefrontSurfaceLabels,
} from '@tuturuuu/ui/storefront';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { STOREFRONT_APP_URL } from '@/constants/common';

type PreviewDevice = 'desktop' | 'mobile' | 'tablet';

const deviceClasses: Record<PreviewDevice, string> = {
  desktop: 'w-full',
  mobile: 'mx-auto w-full max-w-[390px]',
  tablet: 'mx-auto w-full max-w-[820px]',
};

const deviceIcons = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

export function StorefrontPreviewPage({
  storefrontId,
  wsId,
}: {
  storefrontId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.preview');
  const storefrontLabels = useTranslations('inventory.storefront');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [cartLines, setCartLines] = useState<StorefrontCartLine[]>([]);
  const storefrontQuery = useQuery({
    queryFn: () => getInventoryStorefront(wsId, storefrontId),
    queryKey: ['inventory', wsId, 'storefront', storefrontId],
  });
  const listingsQuery = useQuery({
    enabled: Boolean(storefrontQuery.data?.data.id),
    queryFn: () =>
      listInventoryStorefrontListings(wsId, storefrontId, { status: 'all' }),
    queryKey: ['inventory', wsId, 'storefront-listings', storefrontId],
  });
  const storefront = storefrontQuery.data?.data;
  const listings = listingsQuery.data?.data ?? [];
  const isLoading = storefrontQuery.isPending || listingsQuery.isPending;
  const isError = storefrontQuery.isError || listingsQuery.isError;
  const labels: Partial<StorefrontSurfaceLabels> = {
    add: storefrontLabels('add'),
    available: storefrontLabels('available'),
    browse: storefrontLabels('browse'),
    bundle: storefrontLabels('bundle'),
    cart: storefrontLabels('cart'),
    checkout: storefrontLabels('checkout'),
    checkoutDisabled: storefrontLabels('checkoutDisabled'),
    emptyCart: storefrontLabels('emptyCart'),
    emptyListingsDescription: storefrontLabels('emptyListingsDescription'),
    emptyListingsTitle: storefrontLabels('emptyListingsTitle'),
    fallbackDescription: storefrontLabels('fallbackDescription'),
    form: {
      email: storefrontLabels('form.email'),
      name: storefrontLabels('form.name'),
      note: storefrontLabels('form.note'),
      phone: storefrontLabels('form.phone'),
    },
    privateStore: storefrontLabels('privateStore'),
    previewBadge: storefrontLabels('previewBadge'),
    product: storefrontLabels('product'),
    publicStore: storefrontLabels('publicStore'),
    quantity: storefrontLabels('quantity'),
    reserve: storefrontLabels('reserve'),
    reserving: storefrontLabels('reserving'),
    reservedCopy: storefrontLabels('reservedCopy'),
    soldOut: storefrontLabels('soldOut'),
    total: storefrontLabels('total'),
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-border border-b pb-4">
        <div>
          <p className="text-muted-foreground text-sm">{t('eyebrow')}</p>
          <h1 className="font-semibold text-2xl">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a href={`/${wsId}/storefront`}>
              <ArrowLeft className="h-4 w-4" />
              {t('back')}
            </a>
          </Button>
          {storefront ? (
            <Button asChild>
              <a
                href={`${STOREFRONT_APP_URL}/${storefront.slug}`}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
                {t('openLive')}
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-border bg-card p-1">
          {(['desktop', 'tablet', 'mobile'] as const).map((value) => {
            const Icon = deviceIcons[value];

            return (
              <Button
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-sm px-3 font-medium text-sm transition',
                  device === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                key={value}
                onClick={() => setDevice(value)}
                type="button"
                variant="ghost"
              >
                <Icon className="h-4 w-4" />
                {t(`devices.${value}`)}
              </Button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-sm">{t('checkoutDisabled')}</p>
      </div>

      {isLoading ? (
        <div className="h-[640px] animate-pulse rounded-lg border border-border bg-muted/35" />
      ) : null}

      {isError ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-5 text-destructive">
          <p className="font-semibold">{t('errorTitle')}</p>
          <p className="mt-1 text-sm opacity-80">{t('errorDescription')}</p>
          <Button
            className="mt-4"
            onClick={() => {
              storefrontQuery.refetch();
              listingsQuery.refetch();
            }}
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            {t('retry')}
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError && storefront ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-muted/35 p-2">
          <div className={deviceClasses[device]}>
            <StorefrontSurface
              cartLines={cartLines}
              className="max-h-[760px] min-h-[720px] overflow-y-auto overflow-x-hidden rounded-md border border-border"
              compactLayout={device !== 'desktop'}
              labels={labels}
              listings={listings}
              mode="preview"
              notice={t('previewNotice')}
              onDecrement={(listingId) =>
                setCartLines((current) =>
                  current
                    .map((line) =>
                      line.listingId === listingId
                        ? { ...line, quantity: line.quantity - 1 }
                        : line
                    )
                    .filter((line) => line.quantity > 0)
                )
              }
              onIncrement={(listingId, maxQuantity) =>
                setCartLines((current) => {
                  const existing = current.find(
                    (line) => line.listingId === listingId
                  );

                  if (!existing)
                    return [...current, { listingId, quantity: 1 }];

                  return current.map((line) =>
                    line.listingId === listingId
                      ? {
                          ...line,
                          quantity: Math.min(line.quantity + 1, maxQuantity),
                        }
                      : line
                  );
                })
              }
              storefront={storefront}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
