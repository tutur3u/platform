'use client';

import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Package,
  Plus,
  Sparkles,
  Users,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/payment/polar';
import type { WorkspaceProductTier } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';
import type { SeatStatus } from '@/utils/seat-limits';
import { AdjustSeatsDialog } from './adjust-seats-dialog';
import { PaymentMethodsCard } from './payment-methods-card';
import { PlanListDialog } from './plan-list-dialog';
import { SubscriptionConfirmationDialog } from './subscription-confirmation-dialog';

export interface Plan {
  id: string;
  productId: string;
  name: string;
  tier: WorkspaceProductTier;
  billingCycle: string | null;
  startDate: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
  status: string;
  features?: string[];
  // Seat-based pricing fields
  pricingModel: 'fixed' | 'seat_based' | 'custom' | 'free' | 'metered_unit';
  seatCount: number | null;
  price: number | null;
  pricePerSeat: number | null;
  maxSeats: number | null;
}

interface BillingClientProps {
  isPersonalWorkspace: boolean;
  currentPlan: Plan;
  wsId: string;
  products: Product[];
  product_id: string;
  seatStatus?: SeatStatus;
  hasManageSubscriptionPermission: boolean;
}

function getSimplePlanName(name: string): string {
  return name
    .replace(/^Tuturuuu\s+Workspace\s+/i, '')
    .replace(/^Tuturuuu\s+/i, '')
    .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
    .trim();
}

export function BillingClient({
  isPersonalWorkspace,
  currentPlan,
  products,
  wsId,
  seatStatus,
  hasManageSubscriptionPermission,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [showAdjustSeatsDialog, setShowAdjustSeatsDialog] = useState(false);
  const t = useTranslations('billing');
  const router = useRouter();

  const isPaidPlan = currentPlan.tier && currentPlan.tier !== 'FREE';
  const isEnterprisePlan = currentPlan.tier === 'ENTERPRISE';
  const isProPlan = currentPlan.tier === 'PRO';
  const isPlusPlan = currentPlan.tier === 'PLUS';
  const simplePlanName = getSimplePlanName(currentPlan.name);
  const isSeatBased = seatStatus?.isSeatBased ?? false;

  // Dynamic color configuration per tier
  const tierConfig = isEnterprisePlan
    ? {
        icon: Building2,
        color: 'text-dynamic-yellow',
        bgColor: 'bg-dynamic-yellow/10',
        borderColor: 'border-dynamic-yellow/50',
        gradient:
          'from-dynamic-yellow/20 via-dynamic-yellow/10 to-dynamic-yellow/20',
        glowClass:
          'shadow-2xl shadow-dynamic-orange/20 ring-2 ring-dynamic-yellow/30',
      }
    : isProPlan
      ? {
          icon: Sparkles,
          color: 'text-dynamic-purple',
          bgColor: 'bg-dynamic-purple/10',
          borderColor: 'border-dynamic-purple/30',
          gradient:
            'from-dynamic-purple/10 via-dynamic-purple/5 to-dynamic-purple/10',
          glowClass: '',
        }
      : isPlusPlan
        ? {
            icon: Zap,
            color: 'text-dynamic-blue',
            bgColor: 'bg-dynamic-blue/10',
            borderColor: 'border-dynamic-blue/30',
            gradient:
              'from-dynamic-blue/10 via-dynamic-blue/5 to-dynamic-blue/10',
            glowClass: '',
          }
        : {
            icon: Package,
            color: 'text-muted-foreground',
            bgColor: 'bg-muted',
            borderColor: 'border-border',
            gradient: 'from-muted/50 via-muted/20 to-transparent',
            glowClass: '',
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
      <div
        className={cn(
          'mb-8 overflow-hidden rounded-2xl border border-border/50 bg-card transition-all duration-300',
          tierConfig.glowClass
        )}
      >
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
                  $
                  {isSeatBased
                    ? centToDollar(currentPlan.pricePerSeat ?? 0)
                    : centToDollar(currentPlan.price ?? 0)}
                </span>
                {currentPlan.billingCycle && (
                  <span className="text-lg text-muted-foreground">
                    {isSeatBased ? `${t('per-seat')} ` : ''}
                    {currentPlan.billingCycle === 'month'
                      ? t('per-month')
                      : t('per-year')}
                  </span>
                )}
              </div>

              {/* Seat Usage - Only show for seat-based pricing */}
              {isSeatBased && seatStatus && (
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {t('seat-usage')}
                      </span>
                    </div>
                    {hasManageSubscriptionPermission && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAdjustSeatsDialog(true)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {t('adjust-seats')}
                      </Button>
                    )}
                  </div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('members')}
                    </span>
                    <span className="font-medium">
                      {seatStatus.memberCount} / {seatStatus.seatCount}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        seatStatus.availableSeats === 0
                          ? 'bg-destructive'
                          : seatStatus.availableSeats <= 2
                            ? 'bg-dynamic-orange'
                            : 'bg-dynamic-green'
                      )}
                      style={{
                        width: `${Math.min(100, (seatStatus.memberCount / Math.max(1, seatStatus.seatCount)) * 100)}%`,
                      }}
                    />
                  </div>
                  {seatStatus.availableSeats === 0 && (
                    <p className="mt-2 text-destructive text-xs">
                      {t('seat-limit-reached')}
                    </p>
                  )}
                  {seatStatus.availableSeats > 0 &&
                    seatStatus.availableSeats <= 2 && (
                      <p className="mt-2 text-dynamic-orange text-xs">
                        {t('seats-running-low', {
                          count: seatStatus.availableSeats,
                        })}
                      </p>
                    )}
                </div>
              )}

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
                {hasManageSubscriptionPermission ? (
                  <>
                    <Button
                      onClick={() => setShowUpgradeOptions(true)}
                      size="lg"
                    >
                      {t('upgrade-plan')}
                    </Button>
                    {hasManageSubscriptionPermission && isPaidPlan && (
                      <Button
                        variant="ghost"
                        size="lg"
                        className={`text-muted-foreground ${currentPlan.cancelAtPeriodEnd ? 'hover:text-dynamic-green' : 'hover:text-dynamic-red'}`}
                        onClick={() => setShowConfirmationDialog(true)}
                      >
                        {currentPlan.cancelAtPeriodEnd ? (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {t('continue-subscription')}
                          </>
                        ) : (
                          <>
                            <X className="mr-2 h-4 w-4" />
                            {t('cancel-subscription')}
                          </>
                        )}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t('subscription-management-restricted')}
                  </p>
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

      <PaymentMethodsCard
        wsId={wsId}
        hasManageSubscriptionPermission={hasManageSubscriptionPermission}
      />

      {/* Dialogs */}
      <PlanListDialog
        isPersonalWorkspace={isPersonalWorkspace}
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
          if (!currentPlan.id) return;
          if (currentPlan.cancelAtPeriodEnd) {
            await handleContinueSubscription(currentPlan.id);
          } else {
            await handleCancelSubscription(currentPlan.id);
          }
        }}
      />

      {/* Add Seats Dialog - Only for seat-based subscriptions */}
      {hasManageSubscriptionPermission && isSeatBased && seatStatus && (
        <AdjustSeatsDialog
          open={showAdjustSeatsDialog}
          onOpenChange={setShowAdjustSeatsDialog}
          wsId={wsId}
          currentSeats={seatStatus.seatCount}
          currentMembers={seatStatus.memberCount}
          maxSeats={currentPlan.maxSeats}
          pricePerSeat={
            seatStatus.pricePerSeat ?? currentPlan.pricePerSeat ?? 0
          }
          billingCycle={currentPlan.billingCycle}
        />
      )}
    </>
  );
}
