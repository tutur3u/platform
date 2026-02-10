import { createClient } from '@tuturuuu/supabase/next/server';
import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  checkManageSubscriptionPermission,
  ensureSubscription,
  fetchProducts,
  fetchWorkspaceOrders,
} from '@/utils/billing-helper';
import { getSeatStatus } from '@/utils/seat-limits';
import { BillingClient } from './billing-client';
import BillingHistory from './billing-history';
import { NoSubscriptionFound } from './no-subscription-found';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Manage Billing in your Tuturuuu workspace.',
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Get user first
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return notFound();

        const [
          isPersonal,
          hasManageSubscriptionPermission,
          subscriptionResult,
          products,
          seatStatus,
          orders,
          locale,
          t,
        ] = await Promise.all([
          isPersonalWorkspace(wsId),
          checkManageSubscriptionPermission(wsId, user.id),
          ensureSubscription(wsId), // Try to ensure subscription exists
          fetchProducts(),
          getSeatStatus(supabase, wsId),
          fetchWorkspaceOrders(wsId),
          getLocale(),
          getTranslations('billing'),
        ]);

        // Handle subscription creation failure
        if (!subscriptionResult.subscription) {
          return (
            <NoSubscriptionFound wsId={wsId} error={subscriptionResult.error} />
          );
        }

        const subscription = subscriptionResult.subscription;

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
          <div className="container mx-auto max-w-6xl px-4 py-8">
            <BillingClient
              wsId={wsId}
              isPersonalWorkspace={isPersonal}
              hasManageSubscriptionPermission={hasManageSubscriptionPermission}
              currentPlan={currentPlan}
              products={products}
              seatStatus={seatStatus}
            />

            <BillingHistory orders={orders} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
