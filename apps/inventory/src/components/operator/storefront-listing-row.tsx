'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  InventoryProductSummary,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { updateInventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { money } from './operator-format';
import { ListingEditorDialog } from './storefront-listing-editor-dialog';

const SYNC_BADGE_META: Record<string, { Icon: typeof Clock; tone: string }> = {
  disabled: { Icon: Ban, tone: 'text-muted-foreground' },
  error: { Icon: TriangleAlert, tone: 'text-destructive' },
  pending: { Icon: Clock, tone: 'text-dynamic-orange' },
  synced: { Icon: RefreshCw, tone: 'text-dynamic-green' },
};

function ListingSyncBadge({
  error,
  status,
  syncedAt,
}: {
  error?: string | null;
  status?: string | null;
  syncedAt?: string | null;
}) {
  const t = useTranslations('inventory.operator.polar.sync');
  const locale = useLocale();
  const meta = status ? SYNC_BADGE_META[status] : undefined;
  if (!status || !meta) return null;
  const Icon = meta.Icon;
  const formattedSyncedAt =
    syncedAt &&
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(syncedAt));
  const tip =
    status === 'error' && error
      ? error
      : formattedSyncedAt
        ? `${t('lastSynced')}: ${formattedSyncedAt}`
        : t(`status.${status}`);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-6 w-fit items-center gap-1 rounded-md border border-border px-2 text-xs">
            <Icon className={cn('h-3 w-3', meta.tone)} />
            {t(`status.${status}`)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ListingRow({
  currency,
  listing,
  products,
  storefrontId,
  wsId,
}: {
  currency: string;
  listing: InventoryStorefrontListing;
  products: InventoryProductSummary[];
  storefrontId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const variantCount = (listing.variants ?? []).filter(
    (variant) => variant.status === 'active'
  ).length;
  const isPublished = listing.status === 'published';
  const toggleMutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefrontListing(wsId, storefrontId, listing.id, {
        status: isPublished ? 'paused' : 'published',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{listing.title}</p>
        <p className="truncate text-muted-foreground text-xs">
          {listing.status}
          {variantCount > 0
            ? ` · ${t('variantCount', { count: variantCount })}`
            : ''}
        </p>
      </div>
      <ListingSyncBadge
        error={listing.polarLastError}
        status={listing.polarSyncStatus}
        syncedAt={listing.polarSyncedAt}
      />
      <span>{money(listing.price, currency)}</span>
      <Button
        aria-label={isPublished ? t('pauseListing') : t('publishListing')}
        disabled={toggleMutation.isPending}
        onClick={() => toggleMutation.mutate()}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isPublished ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        {isPublished ? t('pauseListing') : t('publishListing')}
      </Button>
      <ListingEditorDialog
        currency={currency}
        listing={listing}
        products={products}
        storefrontId={storefrontId}
        wsId={wsId}
      />
    </div>
  );
}
