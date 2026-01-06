'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle,
  Crown,
  Info,
  Shield,
  Sparkles,
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
import { centToDollar } from '@/utils/price-helper';
import type { Plan } from './billing-client';
import PurchaseLink from './purchase-link';

interface PlanListProps {
  currentPlan: Plan;
  products: Product[];
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlanList({
  currentPlan,
  products,
  wsId,
  open,
  onOpenChange,
}: PlanListProps) {
  const t = useTranslations('billing');

  // Helper to simplify plan names (remove "Tuturuuu Workspace" prefix and billing cycle suffix)
  const getSimplePlanName = (name: string): string => {
    return name
      .replace(/^Tuturuuu\s+Workspace\s+/i, '')
      .replace(/^Tuturuuu\s+/i, '')
      .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
      .trim();
  };

  const upgradePlans = products
    .map((product) => ({
      id: product.id,
      name: getSimplePlanName(product.name),
      fullName: product.name,
      price:
        product.prices.length > 0
          ? product.prices[0] && 'priceAmount' in product.prices[0]
            ? product.prices[0].priceAmount
            : 0
          : 0,
      billingCycle: product.recurringInterval,
      features: product.benefits
        ? product.benefits
            .map((benefit) =>
              'description' in benefit ? (benefit.description as string) : ''
            )
            .filter(Boolean)
        : [],
      isEnterprise: product.name.toLowerCase().includes('enterprise'),
      isPro: product.name.toLowerCase().includes('pro'),
      isPlus: product.name.toLowerCase().includes('plus'),
      isFree: product.name.toLowerCase().includes('free'),
    }))
    .sort((a, b) => a.price - b.price);

  // Get plan styling based on tier
  // NOTE: popular/bestValue badges don't show if it's the current plan
  const getPlanStyles = (
    plan: (typeof upgradePlans)[0],
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
        popular: plan.billingCycle === 'month' && !isCurrentPlan,
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
  const getPlanButtonConfig = (plan: (typeof upgradePlans)[0]) => {
    const isCurrentPlan = plan.id === currentPlan.productId;

    if (isCurrentPlan) {
      return {
        text: t('current-plan'),
        icon: CheckCircle,
        variant: 'outline' as const,
        disabled: true,
      };
    }

    const currentPlanData = upgradePlans.find(
      (p) => p.id === currentPlan.productId
    );
    const isDowngrade = currentPlanData && plan.price < currentPlanData.price;

    if (isDowngrade) {
      return {
        text: t('downgrade-to', { plan: plan.name }),
        icon: ArrowDownCircle,
        variant: 'outline' as const,
        disabled: false,
      };
    }

    return {
      text: t('upgrade-to', { plan: plan.name }),
      icon: ArrowUpCircle,
      variant: 'default' as const,
      disabled: false,
    };
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
          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {upgradePlans.map((plan) => {
              const isCurrentPlan = plan.id === currentPlan.productId;
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
                    'hover:-translate-y-1 hover:shadow-2xl'
                  )}
                >
                  {/* Inner Card */}
                  <div
                    className={cn(
                      'relative h-full rounded-2xl bg-linear-to-br p-6',
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
                    <div className="mb-5">
                      <div className="mb-3 flex items-center gap-2.5">
                        <div className={cn('rounded-xl p-2.5', styles.iconBg)}>
                          <PlanIcon
                            className={cn('h-6 w-6', styles.iconColor)}
                          />
                        </div>
                        <h3 className="font-black text-xl tracking-tight">
                          {plan.name}
                        </h3>
                      </div>

                      {/* Pricing */}
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={cn(
                            'font-black text-3xl',
                            plan.isFree
                              ? 'text-muted-foreground'
                              : styles.iconColor
                          )}
                        >
                          ${centToDollar(plan.price)}
                        </span>
                        {plan.billingCycle && (
                          <span className="text-muted-foreground">
                            /{plan.billingCycle}
                          </span>
                        )}
                      </div>

                      {/* Savings indicator for yearly plans */}
                      {plan.billingCycle === 'year' && (
                        <p className="mt-1.5 font-medium text-dynamic-green text-sm">
                          {t('save-17-percent')}
                        </p>
                      )}
                    </div>

                    {/* Features List */}
                    <ul className="mb-6 space-y-2.5">
                      {plan.features.slice(0, 5).map((feature, index) => (
                        <li key={index} className="flex items-start gap-2.5">
                          <div
                            className={cn(
                              'mt-0.5 rounded-full p-1 transition-colors',
                              styles.iconBg,
                              'group-hover:bg-opacity-100'
                            )}
                          >
                            <CheckCircle
                              className={cn('h-3.5 w-3.5', styles.iconColor)}
                            />
                          </div>
                          <span className="flex-1 text-muted-foreground text-sm leading-relaxed">
                            {feature}
                          </span>
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="pl-7 text-muted-foreground/70 text-sm">
                          +{plan.features.length - 5} {t('more-features')}
                        </li>
                      )}
                    </ul>

                    {/* CTA Button */}
                    {plan.isEnterprise ? (
                      <div className="flex flex-col gap-2">
                        <Button
                          className="w-full shadow-lg transition-all hover:scale-[1.02]"
                          variant="outline"
                          disabled
                          size="lg"
                        >
                          <Crown className="mr-2 h-5 w-5" />
                          {t('contact-sales')}
                        </Button>
                        <p className="text-center text-muted-foreground text-xs">
                          {t('contact-sales-desc')}
                        </p>
                      </div>
                    ) : (
                      (() => {
                        const buttonConfig = getPlanButtonConfig(plan);
                        const ButtonIcon = buttonConfig.icon;

                        return buttonConfig.disabled ? (
                          <Button
                            variant={buttonConfig.variant}
                            className={cn(
                              'w-full shadow-lg',
                              isCurrentPlan &&
                                'border-primary/30 bg-primary/5 text-primary'
                            )}
                            disabled
                            size="lg"
                          >
                            <ButtonIcon className="mr-2 h-5 w-5" />
                            {buttonConfig.text}
                          </Button>
                        ) : (
                          <PurchaseLink
                            subscriptionId={currentPlan.id}
                            productId={plan.id}
                            wsId={wsId}
                            className={cn(
                              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
                              buttonConfig.variant === 'default'
                                ? cn(
                                    'bg-linear-to-r text-white',
                                    plan.isPro
                                      ? 'from-dynamic-purple to-dynamic-pink'
                                      : plan.isPlus
                                        ? 'from-dynamic-blue to-dynamic-cyan'
                                        : 'from-primary to-primary/80'
                                  )
                                : 'border-2 border-muted-foreground/30 bg-transparent text-foreground hover:bg-muted/50'
                            )}
                          >
                            <ButtonIcon className="h-5 w-5" />
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
        </div>

        {/* Footer Note */}
        <div className="relative z-10 mt-8 flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-5 backdrop-blur-sm">
          <div className="rounded-lg bg-primary/10 p-2">
            <Info className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{t('plan-note-title')}</p>
            <p className="mt-0.5 text-muted-foreground text-sm leading-relaxed">
              {t('plan-desc')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
