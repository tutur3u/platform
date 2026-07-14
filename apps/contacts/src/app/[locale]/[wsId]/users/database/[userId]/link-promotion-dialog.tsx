'use client';

import { AlertTriangle, ExternalLink, Link, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

interface LinkPromotionDialogProps {
  isLinking: boolean;
  isLoading: boolean;
  isLoadError: boolean;
  manageUrl: string;
  onLink: () => void;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onSelect: (value: string) => void;
  open: boolean;
  options: ComboboxOptions[];
  selectedPromoId: string;
}

export function LinkPromotionDialog({
  isLinking,
  isLoading,
  isLoadError,
  manageUrl,
  onLink,
  onOpenChange,
  onRetry,
  onSelect,
  open,
  options,
  selectedPromoId,
}: LinkPromotionDialogProps) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link className="mr-2 h-4 w-4" />
          {t('ws-user-linked-coupons.link_action')}
        </Button>
      </DialogTrigger>
      <DialogContent onWheel={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('ws-user-linked-coupons.link_action')}</DialogTitle>
          <DialogDescription>
            {t('ws-user-linked-coupons.link_description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2" aria-live="polite">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <p className="text-muted-foreground text-sm">
              {t('ws-user-linked-coupons.loading')}
            </p>
          </div>
        ) : isLoadError ? (
          <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-red" />
              <div className="space-y-2">
                <p className="font-medium">
                  {t('ws-user-linked-coupons.load_failed')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('ws-user-linked-coupons.load_failed_description')}
                </p>
                <Button size="sm" variant="outline" onClick={onRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('ws-user-linked-coupons.retry')}
                </Button>
              </div>
            </div>
          </div>
        ) : options.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="font-medium">
              {t('ws-user-linked-coupons.no_available_title')}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('ws-user-linked-coupons.no_available_description')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="promo-select">
              {t('ws-user-linked-coupons.coupon_label')}
            </Label>
            <Combobox
              t={t}
              options={options}
              selected={selectedPromoId}
              onChange={(value) => onSelect(value as string)}
              placeholder={t('ws-user-linked-coupons.search_placeholder')}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button asChild variant="ghost">
            <a href={manageUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('ws-user-linked-coupons.manage_action')}
            </a>
          </Button>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLinking}
            >
              {t('ws-settings.cancel')}
            </Button>
            <Button
              onClick={onLink}
              disabled={
                isLinking || isLoading || isLoadError || !selectedPromoId
              }
            >
              {isLinking
                ? t('ws-groups.linking')
                : t('ws-user-linked-coupons.link_action')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
