'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Crown,
  Shield,
  Sparkles,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/payment/polar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';
import { PlanList } from './plan-list';
import { SubscriptionConfirmationDialog } from './subscription-confirmation-dialog';

export interface Plan {
  id: string;
  productId: string;
  polarSubscriptionId: string | null;
  name: string;
  price: number;
  billingCycle: string | null;
  startDate: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
  status: string;
  features?: string[];
}

interface BillingClientProps {
  currentPlan: Plan;
  wsId: string;
  products: Product[];
  product_id: string;
  isCreator: boolean;
}

function getSimplePlanName(name: string): string {
  return name
    .replace(/^Tuturuuu\s+Workspace\s+/i, '')
    .replace(/^Tuturuuu\s+/i, '')
    .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
    .trim();
}

export function BillingClient({
  currentPlan,
  products,
  wsId,
  isCreator,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const t = useTranslations('billing');
  const router = useRouter();

  const isPaidPlan = currentPlan.price > 0;
  const isProPlan = currentPlan.name.toLowerCase().includes('pro');
  const isPlusPlan = currentPlan.name.toLowerCase().includes('plus');
  const simplePlanName = getSimplePlanName(currentPlan.name);

  // Dynamic color configuration per tier
  const tierConfig = isProPlan
    ? {
        icon: Crown,
        color: 'text-dynamic-purple',
        bgColor: 'bg-dynamic-purple/10',
        borderColor: 'border-dynamic-purple/30',
        gradient: 'from-dynamic-purple/20 via-dynamic-purple/5 to-transparent',
      }
    : isPlusPlan
      ? {
          icon: Zap,
          color: 'text-dynamic-green',
          bgColor: 'bg-dynamic-green/10',
          borderColor: 'border-dynamic-green/30',
          gradient: 'from-dynamic-green/20 via-dynamic-green/5 to-transparent',
        }
      : {
          icon: Shield,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          borderColor: 'border-border',
          gradient: 'from-muted/50 via-muted/20 to-transparent',
        };

  const TierIcon = tierConfig.icon;

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!subscriptionId) return;
    const response = await fetch(
      `/api/payment/customer-portal/subscriptions/${subscriptionId}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to cancel subscription');
    }
    router.refresh();
  };

  const handleContinueSubscription = async (subscriptionId: string) => {
    if (!subscriptionId) return;
    const response = await fetch(
      `/api/payment/customer-portal/subscriptions/${subscriptionId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' } }
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to continue subscription');
    }
    router.refresh();
  };

  return (
    <>
      {/* Hero Section */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className={cn('bg-linear-to-r p-6 md:p-8', tierConfig.gradient)}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Plan Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl',
                    tierConfig.bgColor
                  )}
                >
                  <TierIcon className={cn('h-6 w-6', tierConfig.color)} />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">
                    {t('current-plan')}
                  </p>
                  <h1 className="font-bold text-2xl tracking-tight">
                    {simplePlanName}
                  </h1>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'ml-2 border',
                    tierConfig.borderColor,
                    tierConfig.color
                  )}
                >
                  <CheckCircle className="mr-1 h-3 w-3" />
                  {t('status-active')}
                </Badge>
              </div>

              {/* Pricing */}
              <div className="flex items-baseline gap-1">
                <span className="font-black text-4xl tracking-tight">
                  ${centToDollar(currentPlan.price)}
                </span>
                {currentPlan.billingCycle && (
                  <span className="text-lg text-muted-foreground">
                    {currentPlan.billingCycle === 'month'
                      ? t('per-month')
                      : t('per-year')}
                  </span>
                )}
              </div>

              {/* Features */}
              {currentPlan.features && currentPlan.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {currentPlan.features.map((feature, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1.5 text-sm backdrop-blur-sm"
                    >
                      <CheckCircle
                        className={cn('h-3.5 w-3.5', tierConfig.color)}
                      />
                      {feature}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={() => setShowUpgradeOptions(true)} size="lg">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('upgrade-plan')}
                </Button>
                {isPaidPlan && isCreator && (
                  <Button
                    variant="ghost"
                    size="lg"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setShowConfirmationDialog(true)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    {currentPlan.cancelAtPeriodEnd
                      ? t('continue-subscription')
                      : t('cancel-subscription')}
                  </Button>
                )}
              </div>
            </div>

            {/* Billing Stats */}
            <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-col lg:gap-4">
              <div className="rounded-xl border bg-background/80 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium text-xs uppercase tracking-wider">
                    {t('start-date')}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-lg">
                  {currentPlan.startDate}
                </p>
              </div>

              <div className="rounded-xl border bg-background/80 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium text-xs uppercase tracking-wider">
                    {t('next-billing')}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-lg">
                  {currentPlan.nextBillingDate}
                </p>
              </div>
            </div>
          </div>

          {/* Cancellation Warning */}
          {currentPlan.cancelAtPeriodEnd && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-dynamic-yellow" />
              <div>
                <p className="font-semibold text-dynamic-yellow">
                  {t('subscription-ending-soon')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('subscription-ends-on')} {currentPlan.nextBillingDate}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <PlanList
        currentPlan={currentPlan}
        products={products}
        wsId={wsId}
        open={showUpgradeOptions}
        onOpenChange={setShowUpgradeOptions}
      />

      <SubscriptionConfirmationDialog
        open={showConfirmationDialog}
        onOpenChange={setShowConfirmationDialog}
        currentPlan={{ ...currentPlan, name: simplePlanName }}
        onConfirm={async () => {
          if (!currentPlan.polarSubscriptionId) return;
          if (currentPlan.cancelAtPeriodEnd) {
            await handleContinueSubscription(currentPlan.polarSubscriptionId);
          } else {
            await handleCancelSubscription(currentPlan.polarSubscriptionId);
          }
        }}
      />
    </>
  );
}
