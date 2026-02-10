'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
  Crown,
  Info,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/payment/polar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';
import type { SeatStatus } from '@/utils/seat-limits';
import type { Plan } from './billing-client';
import { PlanChangeConfirmationDialog } from './plan-change-confirmation-dialog';
import PurchaseLink from './purchase-link';

interface PlanListDialogProps {
  isPersonalWorkspace: boolean;
  currentPlan: Plan;
  products: Product[];
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seatStatus?: SeatStatus;
}

type BillingCycleTab = 'month' | 'year';

export function PlanListDialog({
  isPersonalWorkspace,
  currentPlan,
  products,
  wsId,
  open,
  onOpenChange,
  seatStatus,
}: PlanListDialogProps) {
  const t = useTranslations('billing');

  // Default to yearly tab for better value proposition, unless current plan is monthly
  const [selectedCycle, setSelectedCycle] = useState<BillingCycleTab>(
    currentPlan.billingCycle === 'month' ? 'month' : 'year'
  );

  // State for plan change confirmation dialog
  const [showPlanChangeDialog, setShowPlanChangeDialog] = useState(false);
  const [selectedTargetPlan, setSelectedTargetPlan] = useState<string | null>(
    null
  );

  // Helper to simplify plan names (remove "Tuturuuu Workspace" prefix and billing cycle suffix)
  const getSimplePlanName = (name: string): string => {
    return name
      .replace(/^Tuturuuu\s+Workspace\s+/i, '')
      .replace(/^Tuturuuu\s+/i, '')
      .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
      .trim();
  };

  const allPlans = products
    .map((product) => {
      const firstPrice = product.prices.find((p) => 'amountType' in p);

      const isSeatBased = firstPrice?.amountType === 'seat_based';
      const isFixed = firstPrice?.amountType === 'fixed';
      const isFreeModel = firstPrice?.amountType === 'free';

      const price = isFixed ? firstPrice.priceAmount : null;

      const pricePerSeat = isSeatBased
        ? (firstPrice?.seatTiers?.tiers?.[0]?.pricePerSeat ?? null)
        : null;

      const minSeats = isSeatBased ? firstPrice?.seatTiers?.minimumSeats : null;

      const maxSeats = isSeatBased ? firstPrice?.seatTiers?.maximumSeats : null;

      if (
        !isFreeModel &&
        ((isPersonalWorkspace && isSeatBased) ||
          (!isPersonalWorkspace && !isSeatBased))
      ) {
        // Exclude seat-based plans for personal workspaces
        return null;
      }

      return {
        id: product.id,
        name: getSimplePlanName(product.name),
        fullName: product.name,
        price,
        billingCycle: product.recurringInterval,
        features: product.benefits
          ? product.benefits
              .map((benefit) =>
                'description' in benefit ? (benefit.description as string) : ''
              )
              .filter(Boolean)
          : [],
        isEnterprise: product.metadata.product_tier === 'ENTERPRISE',
        isPro: product.metadata.product_tier === 'PRO',
        isPlus: product.metadata.product_tier === 'PLUS',
        isFree: product.metadata.product_tier === 'FREE',
        // Seat-based pricing fields
        pricingModel: firstPrice?.amountType || 'free',
        pricePerSeat,
        minSeats,
        maxSeats,
      };
    })
    .filter((plan) => plan !== null)
    .sort((a, b) => {
      if (a!.isFree) return -1;
      if (b!.isFree) return 1;

      if (a.pricingModel === 'seat_based' && b.pricingModel === 'seat_based')
        return (a.pricePerSeat ?? 0) - (b.pricePerSeat ?? 0);

      return (a.price ?? 0) - (b.price ?? 0);
    });

  // Filter plans by selected billing cycle (Free plan shown in both)
  const filteredPlans = allPlans.filter(
    (plan) => plan.isFree || plan.billingCycle === selectedCycle
  );

  // Get plan styling based on tier
  const getPlanStyles = (
    plan: (typeof allPlans)[0],
    isCurrentPlan: boolean
  ) => {
    if (plan.isPro) {
      return {
        gradient:
          'from-dynamic-purple/60 via-dynamic-pink/40 to-dynamic-orange/30',
        bgGradient: 'from-dynamic-purple/5 via-transparent to-transparent',
        borderGradient:
          'before:from-dynamic-purple/50 before:via-dynamic-pink/40 before:to-dynamic-orange/30',
        iconBg: 'bg-dynamic-purple/10',
        iconColor: 'text-dynamic-purple',
        badgeClass:
          'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
        Icon: Crown,
        popular: false,
        bestValue: plan.billingCycle === 'year' && !isCurrentPlan,
      };
    }
    if (plan.isPlus) {
      const plusMonthlyIsCurrent =
        currentPlan.name.toLowerCase().includes('plus') &&
        currentPlan.billingCycle === 'month';
      return {
        gradient:
          'from-dynamic-blue/60 via-dynamic-cyan/40 to-dynamic-green/30',
        bgGradient: 'from-dynamic-blue/5 via-transparent to-transparent',
        borderGradient:
          'before:from-dynamic-blue/50 before:via-dynamic-cyan/40 before:to-dynamic-green/30',
        iconBg: 'bg-dynamic-blue/10',
        iconColor: 'text-dynamic-blue',
        badgeClass:
          'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
        Icon: Zap,
        popular:
          plan.billingCycle === 'month' &&
          !plusMonthlyIsCurrent &&
          !isCurrentPlan,
        bestValue: false,
      };
    }
    return {
      gradient: 'from-muted via-muted/50 to-transparent',
      bgGradient: 'from-muted/30 via-transparent to-transparent',
      borderGradient:
        'before:from-muted before:via-muted/50 before:to-muted/30',
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      badgeClass: 'bg-muted text-muted-foreground border-border',
      Icon: Shield,
      popular: false,
      bestValue: false,
    };
  };

  // Helper function to determine button state and text
  const getPlanButtonConfig = (plan: (typeof allPlans)[0]) => {
    const isCurrentPlan = plan.id === currentPlan.productId;

    if (isCurrentPlan) {
      return {
        text: t('current-plan'),
        icon: CheckCircle,
        variant: 'outline' as const,
        disabled: true,
      };
    }

    if (currentPlan.tier !== 'FREE' && plan.isFree) {
      return {
        text: t('cannot-downgrade-to-free'),
        icon: X,
        variant: 'outline' as const,
        disabled: true,
      };
    }

    const isDowngrade =
      currentPlan.tier !== 'FREE' &&
      ((plan.pricingModel === 'fixed' &&
        (plan.price ?? 0) < (currentPlan.price ?? 0)) ||
        (plan.pricingModel === 'seat_based' &&
          (plan.pricePerSeat ?? 0) < (currentPlan.pricePerSeat ?? 0)));

    if (isDowngrade) {
      return {
        text: t('downgrade-to', { plan: plan.name }),
        icon: ArrowDownCircle,
        variant: 'outline' as const,
        disabled: plan.isFree, // Disable downgrade to Free plan via button
      };
    }

    return {
      text: t('upgrade-to', { plan: plan.name }),
      icon: ArrowUpCircle,
      variant: 'default' as const,
      disabled: false,
      isIncompatible: false,
    };
  };

  // Handle plan change for existing subscriptions
  const handlePlanChange = (plan: (typeof allPlans)[0]) => {
    setSelectedTargetPlan(plan.id);
    setShowPlanChangeDialog(true);
  };

  // Handle successful plan change
  const handlePlanChangeSuccess = () => {
    setShowPlanChangeDialog(false);
    setSelectedTargetPlan(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-4xl lg:max-w-6xl">
        {/* Decorative Background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-blue/30 via-dynamic-purple/20 to-transparent blur-3xl" />
          <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-linear-to-tl from-dynamic-pink/30 via-dynamic-orange/20 to-transparent blur-3xl" />
        </div>

        <DialogHeader className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-linear-to-br from-primary/20 to-primary/5 p-2.5">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="font-bold text-2xl tracking-tight">
                {t('upgrade-plan')}
              </DialogTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('choose-plan-description')}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="relative z-10 mt-6 px-1">
          {/* Billing Cycle Toggle */}
          <div className="mb-6 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setSelectedCycle('month')}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 font-medium text-sm transition-all',
                  selectedCycle === 'month'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Calendar className="h-4 w-4" />
                {t('monthly-plans')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCycle('year')}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 font-medium text-sm transition-all',
                  selectedCycle === 'year'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Calendar className="h-4 w-4" />
                {t('yearly-plans')}
                <Badge
                  variant="outline"
                  className="ml-1 border-dynamic-green/30 bg-dynamic-green/10 px-1.5 py-0 text-[10px] text-dynamic-green"
                >
                  -17%
                </Badge>
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {filteredPlans.map((plan) => {
              const isCurrentPlan = plan.id === currentPlan.productId;
              const isSeatBased = plan.pricingModel === 'seat_based';
              const isFixed = plan.pricingModel === 'fixed';
              const styles = getPlanStyles(plan, isCurrentPlan);
              const PlanIcon = styles.Icon;

              // Check if Pro Monthly should show Recommended (when Plus Monthly is current)
              const plusMonthlyIsCurrent =
                currentPlan.name.toLowerCase().includes('plus') &&
                currentPlan.billingCycle === 'month';
              const showRecommendedOnPro =
                plan.isPro &&
                plan.billingCycle === 'month' &&
                plusMonthlyIsCurrent;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl transition-all duration-500',
                    'before:absolute before:inset-0 before:rounded-2xl before:border-2 before:border-transparent before:bg-linear-to-br before:p-0.5 before:opacity-0 before:transition-opacity',
                    styles.borderGradient,
                    isCurrentPlan
                      ? 'border-2 border-primary/50 bg-primary/5'
                      : 'border border-border/50 bg-card hover:border-transparent hover:before:opacity-100',
                    'hover:-translate-y-1 hover:shadow-xl'
                  )}
                >
                  {/* Inner Card */}
                  <div
                    className={cn(
                      'relative h-full rounded-2xl bg-linear-to-br p-5',
                      styles.bgGradient
                    )}
                  >
                    {/* Badges */}
                    <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                      {(styles.popular || showRecommendedOnPro) && (
                        <Badge
                          variant="outline"
                          className="border-dynamic-blue/30 bg-linear-to-r from-dynamic-blue/20 to-dynamic-cyan/20 font-semibold text-dynamic-blue text-xs"
                        >
                          <Sparkles className="mr-1 h-3 w-3" />
                          {t('recommend')}
                        </Badge>
                      )}
                      {styles.bestValue && (
                        <Badge
                          variant="outline"
                          className="border-dynamic-green/30 bg-linear-to-r from-dynamic-green/20 to-dynamic-cyan/20 font-semibold text-dynamic-green text-xs"
                        >
                          <Zap className="mr-1 h-3 w-3" />
                          {t('best-value')}
                        </Badge>
                      )}
                    </div>

                    {/* Plan Header */}
                    <div className="mb-4">
                      <div className="mb-2 flex items-center gap-2">
                        <div className={cn('rounded-lg p-2', styles.iconBg)}>
                          <PlanIcon
                            className={cn('h-5 w-5', styles.iconColor)}
                          />
                        </div>
                        <h3 className="font-bold text-lg tracking-tight">
                          {plan.name}
                        </h3>
                      </div>

                      {/* Pricing */}
                      <div className="flex items-baseline gap-1">
                        <span
                          className={cn(
                            'font-black text-2xl',
                            plan.isFree
                              ? 'text-muted-foreground'
                              : styles.iconColor
                          )}
                        >
                          $
                          {isSeatBased && plan.pricePerSeat
                            ? centToDollar(plan.pricePerSeat)
                            : isFixed && plan.price
                              ? centToDollar(plan.price)
                              : 0}
                        </span>
                        {plan.billingCycle && (
                          <span className="text-muted-foreground text-sm">
                            {isSeatBased ? t('per-seat') : ''}
                            {plan.billingCycle === 'month'
                              ? t('per-month')
                              : t('per-year')}
                          </span>
                        )}
                      </div>

                      {/* Seat Limits */}
                      {(plan.minSeats || plan.maxSeats) && (
                        <div className="mt-1 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                          <Users className="h-3.5 w-3.5" />
                          <span>
                            {plan.maxSeats
                              ? `${plan.minSeats || 1}-${plan.maxSeats} ${t('seats')}`
                              : `Min ${plan.minSeats || 1} ${t('seats')}`}
                          </span>
                        </div>
                      )}

                      {/* Estimated total for seat-based plans */}
                      {isSeatBased &&
                        plan.pricePerSeat &&
                        seatStatus?.memberCount && (
                          <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                            <p className="font-medium text-foreground text-xs">
                              {t('estimated-total', {
                                total: centToDollar(
                                  plan.pricePerSeat *
                                    Math.max(
                                      seatStatus.memberCount,
                                      plan.minSeats ?? 1
                                    )
                                ),
                                cycle:
                                  plan.billingCycle === 'month'
                                    ? t('mo')
                                    : t('per-year'),
                                count: Math.max(
                                  seatStatus.memberCount,
                                  plan.minSeats ?? 1
                                ),
                              })}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {t('based-on-current-members')}
                            </p>
                          </div>
                        )}

                      {/* Savings indicator for yearly plans */}
                      {plan.billingCycle === 'year' && (
                        <p className="mt-1 font-medium text-dynamic-green text-xs">
                          {t('save-17-percent')}
                        </p>
                      )}
                    </div>

                    {/* Features List */}
                    <ul className="mb-4 space-y-2">
                      {plan.features.slice(0, 4).map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div
                            className={cn(
                              'mt-0.5 rounded-full p-0.5 transition-colors',
                              styles.iconBg
                            )}
                          >
                            <CheckCircle
                              className={cn('h-3 w-3', styles.iconColor)}
                            />
                          </div>
                          <span className="flex-1 text-muted-foreground text-xs leading-relaxed">
                            {feature}
                          </span>
                        </li>
                      ))}
                      {plan.features.length > 4 && (
                        <li className="pl-5 text-muted-foreground/70 text-xs">
                          +{plan.features.length - 4} {t('more-features')}
                        </li>
                      )}
                    </ul>

                    {/* CTA Button */}
                    {plan.isEnterprise ? (
                      <div className="flex flex-col gap-2">
                        <Button
                          className="w-full transition-all hover:scale-[1.02]"
                          variant="outline"
                          disabled
                          size="sm"
                        >
                          <Crown className="mr-2 h-4 w-4" />
                          {t('contact-sales')}
                        </Button>
                      </div>
                    ) : (
                      (() => {
                        const buttonConfig = getPlanButtonConfig(plan);
                        const ButtonIcon = buttonConfig.icon;

                        return buttonConfig.disabled ? (
                          <div className="space-y-2">
                            <Button
                              variant={buttonConfig.variant}
                              className={cn(
                                'w-full',
                                isCurrentPlan &&
                                  'border-primary/30 bg-primary/5 text-primary'
                              )}
                              disabled
                              size="sm"
                            >
                              <ButtonIcon className="mr-2 h-4 w-4" />
                              {buttonConfig.text}
                            </Button>
                          </div>
                        ) : (
                          <PurchaseLink
                            subscriptionId={currentPlan.id}
                            wsId={wsId}
                            productId={plan.id}
                            onCheckoutOpened={() => {
                              onOpenChange(false);
                            }}
                            onPlanChange={
                              currentPlan.tier === 'FREE'
                                ? undefined
                                : () => handlePlanChange(plan)
                            }
                            className={cn(
                              'w-full transition-all hover:scale-[1.02]',
                              !plan.isFree &&
                                buttonConfig.variant === 'default' &&
                                plan.isPlus &&
                                'bg-linear-to-r from-blue-600 to-cyan-500 text-white shadow-blue-500/25 shadow-lg hover:shadow-blue-500/40',
                              !plan.isFree &&
                                buttonConfig.variant === 'default' &&
                                plan.isPro &&
                                'bg-linear-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                            )}
                          >
                            <ButtonIcon className="mr-2 h-4 w-4" />
                            {buttonConfig.text}
                          </PurchaseLink>
                        );
                      })()
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Important Note */}
          {currentPlan.tier !== 'FREE' && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-semibold text-sm">{t('plan-note-title')}</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {t('plan-desc')}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Plan Change Confirmation Dialog */}
      {selectedTargetPlan && currentPlan.id && (
        <PlanChangeConfirmationDialog
          open={showPlanChangeDialog}
          onOpenChange={setShowPlanChangeDialog}
          targetPlanId={selectedTargetPlan}
          subscriptionId={currentPlan.id}
          onSuccess={handlePlanChangeSuccess}
        />
      )}
    </Dialog>
  );
}
