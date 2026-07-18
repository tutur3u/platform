'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Clock, Package, RefreshCw, Zap } from '@tuturuuu/icons';
import {
  createPayCreditPackCheckout,
  getPayWorkspaceAiCreditStatus,
  type WorkspaceAiCreditStatus,
} from '@tuturuuu/internal-api';
import { PolarEmbedCheckout } from '@tuturuuu/payment/polar/checkout/embed';
import type { CreditPackListItem } from '@tuturuuu/payment-core/billing-helper';
import { centToDollar } from '@tuturuuu/payment-core/price-helper';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

interface AiCreditBillingCardProps {
  wsId: string;
  packs: CreditPackListItem[];
}

function barWidth(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function formatPrice(currency: string, cents: number): string {
  if (currency === 'usd') {
    return `$${centToDollar(cents)}`;
  }
  return `${currency.toUpperCase()} ${centToDollar(cents)}`;
}

function CreditWalletFrame({
  children,
  description,
  title,
  walletLabel,
}: {
  children: ReactNode;
  description: string;
  title: string;
  walletLabel: string;
}) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-border/60 border-b bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 className="font-bold text-xl tracking-tight">{title}</h2>
          <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
        </div>
        <Badge
          variant="outline"
          className="w-fit shrink-0 border-dynamic-blue/30 bg-dynamic-blue/5 text-dynamic-blue"
        >
          <Zap className="mr-1 h-3 w-3" />
          {walletLabel}
        </Badge>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

export function AiCreditBillingCard({ wsId, packs }: AiCreditBillingCardProps) {
  const t = useTranslations('billing');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const [checkoutInstance, setCheckoutInstance] =
    useState<PolarEmbedCheckout | null>(null);
  const [processingPackId, setProcessingPackId] = useState<string | null>(null);

  const creditsQuery = useQuery<WorkspaceAiCreditStatus>({
    queryKey: ['billing-ai-credits', wsId],
    queryFn: () => getPayWorkspaceAiCreditStatus(wsId),
  });

  const purchaseMutation = useMutation({
    mutationFn: async (creditPackId: string) => {
      setProcessingPackId(creditPackId);
      return createPayCreditPackCheckout({ wsId, creditPackId });
    },
    onSuccess: async (payload) => {
      const checkout = await PolarEmbedCheckout.create(payload.url, {
        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
      });
      setCheckoutInstance(checkout);
      setProcessingPackId(null);
    },
    onError: (error) => {
      setProcessingPackId(null);
      toast.error(
        error instanceof Error
          ? error.message
          : t('credit-pack-checkout-failed-description')
      );
    },
  });

  useEffect(() => {
    return () => {
      if (checkoutInstance) {
        checkoutInstance.close();
        setCheckoutInstance(null);
      }
    };
  }, [checkoutInstance]);

  const creditData = creditsQuery.data;

  const includedTotal = useMemo(
    () =>
      (creditData?.included.totalAllocated ?? 0) +
      (creditData?.included.bonusCredits ?? 0),
    [creditData]
  );
  const paygTotal = creditData?.payg.totalGranted ?? 0;
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale]
  );

  if (creditsQuery.isLoading) {
    return (
      <CreditWalletFrame
        title={t('ai-credits-title')}
        description={t('ai-credits-description')}
        walletLabel={t('ai-credits-wallet')}
      >
        <div className="mb-4 rounded-xl border border-dynamic-blue/15 bg-dynamic-blue/5 p-4">
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-3 w-56 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <Skeleton className="mb-2 h-4 w-1/3" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <Skeleton className="mb-2 h-4 w-1/3" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </CreditWalletFrame>
    );
  }

  if (creditsQuery.isError) {
    return (
      <CreditWalletFrame
        title={t('ai-credits-title')}
        description={t('ai-credits-description')}
        walletLabel={t('ai-credits-wallet')}
      >
        <div className="flex flex-col gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">{t('ai-credits-error')}</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('ai-credits-error-description')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 bg-background"
            disabled={creditsQuery.isFetching}
            onClick={() => creditsQuery.refetch()}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${creditsQuery.isFetching ? 'animate-spin' : ''}`}
            />
            {t('retry')}
          </Button>
        </div>
      </CreditWalletFrame>
    );
  }

  return (
    <CreditWalletFrame
      title={t('ai-credits-title')}
      description={t('ai-credits-description')}
      walletLabel={t('ai-credits-wallet')}
    >
      <div className="mb-4 rounded-xl border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
        <div>
          <p className="font-medium text-dynamic-blue text-xs uppercase tracking-wide">
            {t('available-credits')}
          </p>
          <p className="mt-1 font-bold text-2xl tracking-tight sm:text-3xl">
            {t('credits-count', {
              count: numberFormatter.format(creditData?.remaining ?? 0),
            })}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('ai-credits-overview')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-sm">{t('included-credits')}</span>
            <span className="text-muted-foreground text-xs">
              {numberFormatter.format(creditData?.included.remaining ?? 0)} /{' '}
              {numberFormatter.format(includedTotal)}
            </span>
          </div>
          <Progress
            aria-label={t('included-credits')}
            value={barWidth(creditData?.included.remaining ?? 0, includedTotal)}
            indicatorClassName="bg-dynamic-blue"
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-sm">{t('payg-credits')}</span>
            <span className="text-muted-foreground text-xs">
              {numberFormatter.format(creditData?.payg.remaining ?? 0)} /{' '}
              {numberFormatter.format(paygTotal)}
            </span>
          </div>
          <Progress
            aria-label={t('payg-credits')}
            value={barWidth(creditData?.payg.remaining ?? 0, paygTotal)}
            indicatorClassName="bg-dynamic-green"
          />
          {creditData?.payg.nextExpiry && (
            <p className="mt-2 flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              {t('payg-next-expiry', {
                date: new Date(creditData.payg.nextExpiry).toLocaleDateString(
                  locale
                ),
              })}
            </p>
          )}
        </div>
      </div>

      {packs.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold text-base">
            {t('buy-credit-packs')}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="group rounded-xl border border-border/60 bg-background/60 p-4 transition-colors hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{pack.name}</p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {pack.description ||
                        t('credit-pack-description-fallback', {
                          tokens: pack.tokens,
                        })}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted p-2 transition-colors group-hover:bg-dynamic-blue/10 group-hover:text-dynamic-blue">
                    <Package className="h-4 w-4" />
                  </div>
                </div>

                <div className="mb-3 flex items-end justify-between gap-3">
                  <p className="font-bold text-lg">
                    {formatPrice(pack.currency, pack.price)}
                  </p>
                  <Badge variant="secondary">
                    {t('credits-count', {
                      count: numberFormatter.format(pack.tokens),
                    })}
                  </Badge>
                </div>
                <p className="mb-3 text-muted-foreground text-xs">
                  {t('credit-pack-validity', { days: pack.expiryDays })}
                </p>

                <Button
                  size="sm"
                  className="w-full"
                  disabled={purchaseMutation.isPending}
                  onClick={() => purchaseMutation.mutate(pack.id)}
                >
                  {purchaseMutation.isPending && processingPackId === pack.id
                    ? t('credit-pack-processing')
                    : t('buy-now')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </CreditWalletFrame>
  );
}
