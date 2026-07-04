'use client';

import { Check, PackagePlus, Search } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryBundleCategoryCandidate,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../dialog';
import { Input } from '../input';
import type { StorefrontCartLine, StorefrontSurfaceLabels } from './types';
import {
  createStorefrontBundleSelectionKey,
  formatStorefrontPrice,
  getStorefrontBundleSelectionSubtotal,
} from './utils';

type BundleSelectionDialogProps = {
  bundle: InventoryBundle | null;
  currency: string;
  labels: StorefrontSurfaceLabels;
  listing: InventoryStorefrontListing | null;
  onAdd?: (line: StorefrontCartLine) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  radius: string;
};

export function StorefrontBundleSelectionDialog({
  bundle,
  currency,
  labels,
  listing,
  onAdd,
  onOpenChange,
  open,
  radius,
}: BundleSelectionDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const normalizedQuery = query.trim().toLowerCase();
  const selections = useMemo(() => {
    if (!bundle) return {};

    return Object.fromEntries(
      bundle.categoryComponents.map((component) => {
        const candidates = component.candidates ?? [];
        const items = (selected[component.id] ?? []).flatMap((key) => {
          const candidate = candidates.find(
            (item) => getCandidateKey(item) === key
          );
          return candidate ? [candidateToSelection(candidate)] : [];
        });
        return [component.id, items];
      })
    );
  }, [bundle, selected]);
  const selectionLine: StorefrontCartLine | null =
    listing && bundle
      ? {
          bundleSelections: selections,
          listingId: listing.id,
          quantity: 1,
          selectionKey: createStorefrontBundleSelectionKey(bundle, selections),
        }
      : null;
  const subtotal =
    bundle && selectionLine
      ? getStorefrontBundleSelectionSubtotal(bundle, selectionLine)
      : null;
  const isComplete =
    Boolean(bundle?.categoryComponents.length) &&
    bundle?.categoryComponents.every(
      (component) =>
        (selected[component.id]?.length ?? 0) === component.quantityRequired
    );

  if (!bundle || !listing) return null;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery('');
          setSelected({});
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className="grid max-h-[90dvh] max-w-[min(42rem,calc(100vw-1rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 overflow-hidden border-border/60 p-5 sm:rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle>{labels.bundleSelectionTitle}</DialogTitle>
          <p className="text-muted-foreground text-sm">{listing.title}</p>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchBundleItems}
              value={query}
            />
          </label>
          <p className="rounded-md border border-border bg-muted/25 px-3 py-2 text-muted-foreground text-xs">
            {labels.cheapestFreePreview}
          </p>
        </div>
        <div className="-mr-1 grid gap-4 overflow-y-auto pr-1">
          {bundle.categoryComponents.map((component) => {
            const selectedKeys = selected[component.id] ?? [];
            const filteredCandidates = (component.candidates ?? []).filter(
              (candidate) =>
                !normalizedQuery ||
                candidate.title.toLowerCase().includes(normalizedQuery)
            );

            return (
              <section className="grid gap-2" key={component.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {component.categoryName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {labels.selectedItems
                        .replace('{selected}', String(selectedKeys.length))
                        .replace(
                          '{required}',
                          String(component.quantityRequired)
                        )}
                    </p>
                  </div>
                  <Badge
                    className="border-border bg-background"
                    variant="outline"
                  >
                    {labels.requiredItems.replace(
                      '{count}',
                      String(component.quantityRequired)
                    )}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredCandidates.map((candidate) => {
                    const key = getCandidateKey(candidate);
                    const active = selectedKeys.includes(key);
                    const full =
                      !active &&
                      selectedKeys.length >= component.quantityRequired;
                    const disabled =
                      full || candidate.availableQuantity === 0 || !onAdd;

                    return (
                      <button
                        className={cn(
                          'grid min-h-20 gap-1 rounded-lg border bg-background p-3 text-left text-sm transition',
                          active
                            ? 'border-[var(--storefront-accent,var(--primary))] bg-[var(--storefront-accent-soft,var(--muted))]'
                            : 'border-border hover:border-foreground/35',
                          disabled ? 'cursor-not-allowed opacity-60' : null
                        )}
                        disabled={disabled}
                        key={key}
                        onClick={() =>
                          setSelected((current) => ({
                            ...current,
                            [component.id]: active
                              ? selectedKeys.filter((item) => item !== key)
                              : [...selectedKeys, key],
                          }))
                        }
                        type="button"
                      >
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="line-clamp-2 font-medium">
                            {candidate.title}
                          </span>
                          {active ? <Check className="h-4 w-4" /> : null}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {candidate.unitName || candidate.unitId} /{' '}
                          {candidate.warehouseName || candidate.warehouseId}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatStorefrontPrice(candidate.price, currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-4">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{labels.total}</p>
            <p className="font-semibold tabular-nums">
              {formatStorefrontPrice(subtotal ?? 0, currency)}
            </p>
          </div>
          <Button
            className={cn('min-w-36', radius)}
            disabled={!isComplete || !selectionLine || !onAdd}
            onClick={() => {
              if (!selectionLine || !onAdd) return;
              onAdd(selectionLine);
              onOpenChange(false);
              setQuery('');
              setSelected({});
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" />
            {labels.add}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function candidateToSelection(candidate: InventoryBundleCategoryCandidate) {
  return {
    listingId: candidate.listingId,
    productId: candidate.productId,
    quantity: 1,
    unitId: candidate.unitId,
    variantId: candidate.variantId,
    warehouseId: candidate.warehouseId,
  };
}

function getCandidateKey(candidate: InventoryBundleCategoryCandidate) {
  return [
    candidate.selectionKind,
    candidate.listingId ?? '',
    candidate.variantId ?? '',
    candidate.productId,
    candidate.unitId,
    candidate.warehouseId,
  ].join(':');
}
