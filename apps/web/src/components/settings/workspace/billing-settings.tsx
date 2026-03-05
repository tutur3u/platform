'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { AiCreditBillingCard } from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/billing/ai-credit-billing-card';
import { BillingClient } from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/billing/billing-client';
import BillingHistory from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/billing/billing-history';
import { NoSubscriptionFound } from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/billing/no-subscription-found';
import PaymentMethodsCard from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/billing/payment-methods-card';

interface BillingSettingsProps {
  wsId: string;
}

export default function BillingSettings({ wsId }: BillingSettingsProps) {
  const t = useTranslations('billing');
  const locale = useLocale();

  // Fetch billing data using React Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['workspace-billing', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/billing`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch billing data');
      }

      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dynamic-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <NoSubscriptionFound
        wsId={wsId}
        error={error instanceof Error ? error.message : 'UNKNOWN_ERROR'}
      />
    );
  }

  if (!data?.subscription) {
    return <NoSubscriptionFound wsId={wsId} error="SUBSCRIPTION_NOT_FOUND" />;
  }

  const {
    isPersonalWorkspace,
    hasManagePermission,
    subscription,
    products,
    creditPacks,
    orders,
    seatStatus,
  } = data;

  const dateLocale = locale === 'vi' ? vi : enUS;
  const formatDate = (date: string) =>
    format(new Date(date), 'd MMM, yyyy', { locale: dateLocale });

  const currentPlan = {
    id: subscription.id,
    productId: subscription.product.id,
    name: subscription.product.name || t('no-plan'),
    tier: subscription.product.tier,
    price: subscription.product.price ?? 0,
    billingCycle: subscription.product.recurring_interval,
    startDate: subscription.createdAt
      ? formatDate(subscription.createdAt)
      : '-',
    nextBillingDate: subscription.currentPeriodEnd
      ? formatDate(subscription.currentPeriodEnd)
      : '-',
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    status: subscription.status || 'unknown',
    features: subscription.product.description
      ? [subscription.product.description]
      : [t('premium-features')],
    // Seat-based pricing fields
    pricingModel: subscription.product.pricing_model || 'free',
    pricePerSeat: subscription.product.price_per_seat,
    seatCount: subscription.seatCount,
    seatList: subscription.seatList,
    maxSeats: subscription.product.max_seats,
  };

  return (
    <div className="space-y-6">
      <BillingClient
        wsId={wsId}
        isPersonalWorkspace={isPersonalWorkspace}
        hasManageSubscriptionPermission={hasManagePermission}
        currentPlan={currentPlan}
        products={products}
        seatStatus={seatStatus}
      />

      <PaymentMethodsCard
        wsId={wsId}
        hasManageSubscriptionPermission={hasManagePermission}
      />

      <AiCreditBillingCard
        wsId={wsId}
        packs={creditPacks}
        canPurchase={hasManagePermission}
      />

      <BillingHistory orders={orders} />
    </div>
  );
}
