'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle,
  Info,
  Shield,
  Sparkles,
  Zap,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/payment/polar';
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

  const upgradePlans = products
    .map((product) => ({
      id: product.id,
      name: product.name,
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
    }))
    .sort((a, b) => a.price - b.price)
    .map((plan, index) => ({
      ...plan,
      popular: index === 0,
    }));

  // Helper function to determine button state and text
  const getPlanButtonConfig = (plan: (typeof upgradePlans)[0]) => {
    const isCurrentPlan = plan.id === currentPlan.productId;

    if (isCurrentPlan) {
      return {
        text: 'Current Plan',
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
        text: `Downgrade to ${plan.name}`,
        icon: ArrowDownCircle,
        variant: 'outline' as const,
        disabled: false,
      };
    }

    return {
      text: `Upgrade to ${plan.name}`,
      icon: ArrowUpCircle,
      variant: 'default' as const,
      disabled: false,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-4xl lg:max-w-6xl">
        {/* Decorative Background */}
        <div className="absolute top-0 left-0 h-full w-full overflow-hidden opacity-30">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 blur-3xl" />
          <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-pink/20 to-dynamic-orange/20 blur-3xl" />
        </div>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <DialogTitle className="font-bold text-2xl tracking-tight">
              {t('upgrade-plan')}
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="mt-6 px-4">
          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {upgradePlans.map((plan) => (
              <div
                key={plan.id}
                className={`group relative overflow-hidden rounded-2xl border-2 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${
                  plan.popular
                    ? 'border-primary bg-linear-to-br from-primary/5 via-background to-background shadow-xl'
                    : 'border-border bg-background shadow-lg hover:border-primary/50'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="flex items-center gap-2 rounded-tr-xl rounded-bl-2xl bg-linear-to-br from-primary to-primary/80 px-4 py-2 shadow-lg">
                      <Sparkles className="h-4 w-4 text-primary-foreground" />
                      <span className="font-bold text-primary-foreground text-xs uppercase tracking-wider">
                        {t('recommend')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Card Content */}
                <div className="relative z-10 p-6">
                  {/* Plan Header */}
                  <div className="mb-6">
                    <div className="mb-3 flex items-center gap-2">
                      <div
                        className={`rounded-lg p-2 ${
                          plan.isEnterprise
                            ? 'bg-dynamic-purple/10'
                            : plan.popular
                              ? 'bg-primary/10'
                              : 'bg-muted'
                        }`}
                      >
                        {plan.isEnterprise ? (
                          <Zap className="h-6 w-6 text-dynamic-purple" />
                        ) : (
                          <Shield className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <h3 className="font-black text-xl tracking-tight">
                        {plan.name}
                      </h3>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'font-black text-2xl',
                          plan.isEnterprise
                            ? 'text-dynamic-purple'
                            : 'text-primary'
                        )}
                      >
                        {`$${centToDollar(plan.price)}`}
                      </span>
                      {plan.billingCycle && (
                        <span className="text-muted-foreground">
                          /{plan.billingCycle}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="mb-6 space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="rounded-full bg-primary/10 p-1 transition-colors group-hover:bg-primary/20">
                          <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                        </div>
                        <span className="flex-1 text-sm leading-relaxed">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  {plan.isEnterprise ? (
                    <div className="flex flex-col items-center gap-2">
                      <Button
                        className="w-full shadow-lg transition-all hover:scale-105"
                        variant="outline"
                        disabled
                        size="lg"
                      >
                        <Zap className="mr-2 h-5 w-5" />
                        {t('contact-sales')}
                      </Button>
                      <p className="text-center text-muted-foreground text-sm">
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
                          className="w-full shadow-lg"
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
                          className={`flex w-full items-center justify-center gap-2 shadow-lg transition-all hover:shadow-xl ${
                            buttonConfig.variant === 'default'
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'border-2 border-primary bg-transparent text-primary hover:bg-primary/10'
                          }`}
                        >
                          <ButtonIcon className="h-5 w-5" />
                          {buttonConfig.text}
                        </PurchaseLink>
                      );
                    })()
                  )}
                </div>

                {/* Decorative Gradient for Popular Plan */}
                {plan.popular && (
                  <div className="absolute bottom-0 left-0 h-1 w-full bg-linear-to-r from-dynamic-blue via-dynamic-purple to-dynamic-pink" />
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Footer Note */}
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-6">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t('plan-desc')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
