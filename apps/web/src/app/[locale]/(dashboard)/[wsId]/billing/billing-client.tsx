'use client';

import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  Info,
  Shield,
  Sparkles,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/payment/polar';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';
import PurchaseLink from './purchase-link';

// Define types for the props we're passing from the server component
interface Plan {
  id: string;
  polarSubscriptionId: string;
  productId: string;
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
  products: Product[]; // Keep for admin sync functionality
  product_id: string;
  isCreator: boolean;
  isAdmin?: boolean;
  activeSubscriptionId?: string;
}

export function BillingClient({
  currentPlan,
  isAdmin = false,
  products,
  wsId,
  isCreator,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const t = useTranslations('billing');
  const router = useRouter();

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
      features: product.description
        ? [
            product.description,
            'Customer support',
            'Access to platform features',
          ]
        : [
            'Standard features',
            'Customer support',
            'Access to platform features',
          ],
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

  const handleSyncToProduct = async () => {
    setSyncLoading(true);
    setSyncCompleted(false);
    try {
      const supabase = createClient();

      await Promise.allSettled(
        products.map(async (product) => {
          const { data, error } = await supabase
            .from('workspace_subscription_products')
            .insert({
              id: product.id,
              name: product.name,
              description: product.description || '',
              price:
                product.prices.length > 0
                  ? product.prices[0] && 'priceAmount' in product.prices[0]
                    ? product.prices[0].priceAmount
                    : 0
                  : 0,
              recurring_interval: product.recurringInterval,
            })
            .select();

          if (error) {
            console.error('Error inserting product:', error);
            return null;
          }
          return data;
        })
      );

      setSyncCompleted(true);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!subscriptionId) return;

    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch(
        `/api/payment/customer-portal/subscriptions/${subscriptionId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to cancel subscription');
      }

      setMessage(
        'Your subscription will be canceled at the end of your billing period.'
      );
      router.refresh();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      setMessage(
        `Error: ${error instanceof Error ? error.message : 'Network error occurred. Please try again.'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueSubscription = async (subscriptionId: string) => {
    if (!subscriptionId) return;

    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch(
        `/api/payment/customer-portal/subscriptions/${subscriptionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to continue subscription');
      }

      setMessage('Your subscription will continue at the next billing period.');
      router.refresh();
    } catch (error) {
      console.error('Error continuing subscription:', error);
      setMessage(
        `Error: ${error instanceof Error ? error.message : 'Network error occurred. Please try again.'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header Section with Gradient */}
      <div className="mb-2 flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-dynamic-blue" />
        <h1 className="font-bold text-2xl tracking-tight">{t('billing')}</h1>
      </div>
      <p className="text-muted-foreground">{t('billing-info')}</p>

      {/* Current Plan Card */}
      <div
        className={
          'rounded-2xl border-2 border-border bg-background shadow-xl transition-all duration-300'
        }
      >
        <div className="p-8">
          {/* Cancellation Warning Banner */}
          {currentPlan.cancelAtPeriodEnd && (
            <div className="mb-8 flex items-start gap-4 rounded-xl border-2 border-dynamic-orange bg-dynamic-orange/10 p-5 shadow-lg backdrop-blur-sm dark:bg-dynamic-orange/20">
              <div className="rounded-full bg-dynamic-orange p-2">
                <AlertCircle className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="mb-1.5 font-bold text-dynamic-orange">
                  Subscription Ending Soon
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Your subscription will end on{' '}
                  <span className="font-semibold text-dynamic-orange">
                    {currentPlan.nextBillingDate}
                  </span>
                  . You'll lose access to premium features after this date.
                </p>
              </div>
            </div>
          )}

          {/* Header with Status Badge */}
          <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="mb-2">
                <h2 className="font-bold text-xl tracking-tight">
                  {t('current-plan')}
                </h2>
              </div>
              <p className="text-muted-foreground text-sm">
                {t('current-plan-details')}
              </p>
            </div>
          </div>

          {/* Plan Name and Pricing - Hero Style */}
          <div className="mb-8 rounded-xl border border-border/50 bg-linear-to-br from-muted/50 to-background p-6 shadow-inner">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Your Plan
                </p>
                <h3 className="mb-2 font-black text-2xl tracking-tight">
                  {currentPlan.name}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="font-black text-3xl text-primary">
                    {`$${centToDollar(currentPlan.price)}`}
                  </span>
                  {currentPlan.billingCycle && (
                    <span className="text-muted-foreground">
                      /{currentPlan.billingCycle}
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <Shield className="h-6 w-6 text-primary" />
              </div>
            </div>
          </div>

          {/* Billing Information Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm transition-all hover:border-border hover:shadow-md">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <p className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                  {t('start-date')}
                </p>
              </div>
              <p className="font-bold text-lg">{currentPlan.startDate}</p>
            </div>

            <div
              className={`group relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all ${
                currentPlan.cancelAtPeriodEnd
                  ? 'border-dynamic-orange/50 bg-dynamic-orange/10 hover:shadow-lg'
                  : 'border-border/50 bg-muted/30 hover:border-border hover:shadow-md'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={`rounded-lg p-1.5 ${
                    currentPlan.cancelAtPeriodEnd
                      ? 'bg-dynamic-orange/20'
                      : 'bg-primary/10'
                  }`}
                >
                  <Clock
                    className={`h-4 w-4 ${
                      currentPlan.cancelAtPeriodEnd
                        ? 'text-dynamic-orange'
                        : 'text-primary'
                    }`}
                  />
                </div>
                <p
                  className={`font-bold text-xs uppercase tracking-wider ${
                    currentPlan.cancelAtPeriodEnd
                      ? 'text-dynamic-orange'
                      : 'text-muted-foreground'
                  }`}
                >
                  {currentPlan.cancelAtPeriodEnd
                    ? 'Ends on'
                    : t('next-billing')}
                </p>
              </div>
              <p
                className={`font-bold text-lg ${
                  currentPlan.cancelAtPeriodEnd ? 'text-dynamic-orange' : ''
                }`}
              >
                {currentPlan.nextBillingDate}
              </p>
            </div>
          </div>

          {/* Plan Features */}
          <div className="mb-8 rounded-xl border border-border/50 bg-muted/20 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h4 className="font-bold">Plan Features</h4>
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {currentPlan.features?.map((feature, index) => (
                <li
                  key={index}
                  className="group flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-primary/5"
                >
                  <div className="rounded-full bg-primary/10 p-1 transition-colors group-hover:bg-primary/20">
                    <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                  </div>
                  <span className="flex-1 text-sm leading-relaxed">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Messages */}
          {message && (
            <div
              className={`mb-6 flex items-start gap-3 rounded-xl border-2 p-4 shadow-lg ${
                message.includes('Error')
                  ? 'border-dynamic-red/50 bg-dynamic-red/10 dark:bg-dynamic-red/20'
                  : 'border-dynamic-green/50 bg-dynamic-green/10 dark:bg-dynamic-green/20'
              }`}
            >
              <div
                className={`rounded-full p-1.5 ${
                  message.includes('Error')
                    ? 'bg-dynamic-red/20'
                    : 'bg-dynamic-green/20'
                }`}
              >
                {message.includes('Error') ? (
                  <AlertCircle
                    className={`h-5 w-5 ${
                      message.includes('Error')
                        ? 'text-dynamic-red'
                        : 'text-dynamic-green'
                    }`}
                  />
                ) : (
                  <CheckCircle className="h-5 w-5 text-dynamic-green" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`font-medium text-sm leading-relaxed ${
                    message.includes('Error')
                      ? 'text-dynamic-red'
                      : 'text-dynamic-green'
                  }`}
                >
                  {message}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            <Button
              disabled={!isCreator}
              onClick={() => setShowUpgradeOptions(!showUpgradeOptions)}
              className="flex-1 shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:flex-none"
              size="lg"
            >
              <ArrowUpCircle className="mr-2 h-5 w-5" />
              {showUpgradeOptions ? t('hide-upgrade') : t('upgrade-plan')}
            </Button>
            {currentPlan.id &&
              (currentPlan.cancelAtPeriodEnd ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-dynamic-green text-dynamic-green shadow-lg transition-all hover:scale-105 hover:bg-dynamic-green/10 hover:shadow-xl"
                  onClick={() => handleContinueSubscription(currentPlan.id)}
                  disabled={isLoading}
                >
                  <CheckCircle className="mr-2 h-5 w-5" />
                  {isLoading ? 'Continuing...' : 'Continue Subscription'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-dynamic-red text-dynamic-red shadow-lg transition-all hover:scale-105 hover:bg-dynamic-red/10 hover:shadow-xl"
                  onClick={() => handleCancelSubscription(currentPlan.id)}
                  disabled={isLoading}
                >
                  <X className="mr-2 h-5 w-5" />
                  {isLoading ? 'Cancelling...' : 'Cancel Subscription'}
                </Button>
              ))}
          </div>
        </div>
      </div>

      {/* Upgrade Options */}
      {showUpgradeOptions && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-linear-to-br from-card via-card to-primary/5 p-8 shadow-2xl dark:from-card/80">
          {/* Decorative Background */}
          <div className="absolute top-0 left-0 h-full w-full overflow-hidden opacity-30">
            <div className="-top-24 -left-24 absolute h-96 w-96 rounded-full bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 blur-3xl" />
            <div className="-bottom-24 -right-24 absolute h-96 w-96 rounded-full bg-linear-to-br from-dynamic-pink/20 to-dynamic-orange/20 blur-3xl" />
          </div>

          <div className="relative z-10">
            <div className="mb-8 flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <h2 className="font-bold text-xl tracking-tight">
                {t('upgrade-plan')}
              </h2>
            </div>

            {/* Admin Sync Section */}
            {isAdmin && (
              <div className="mb-8 rounded-xl border border-border bg-background/50 p-6 backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Info className="h-5 w-5 text-muted-foreground" />
                  <p className="font-medium text-muted-foreground text-sm">
                    Admin Controls
                  </p>
                </div>
                {!syncCompleted ? (
                  <Button
                    onClick={handleSyncToProduct}
                    disabled={syncLoading}
                    className="shadow-lg transition-all hover:scale-105"
                    size="lg"
                  >
                    {syncLoading ? 'Syncing...' : 'Sync Products to Database'}
                  </Button>
                ) : (
                  <Button
                    disabled
                    className="bg-dynamic-green shadow-lg hover:bg-dynamic-green"
                    size="lg"
                  >
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Sync Completed
                  </Button>
                )}
              </div>
            )}

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {upgradePlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`group hover:-translate-y-2 relative overflow-hidden rounded-2xl border-2 transition-all duration-300 hover:shadow-2xl ${
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
                        <span className="font-black text-3xl text-primary">
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
                          <Button
                            variant={buttonConfig.variant}
                            className={`w-full shadow-lg transition-all hover:shadow-xl ${
                              buttonConfig.variant === 'default'
                                ? ''
                                : 'border-2 border-primary bg-transparent text-primary hover:bg-primary/10'
                            }`}
                            asChild
                            size="lg"
                          >
                            <PurchaseLink
                              subscriptionId={currentPlan.id}
                              productId={plan.id}
                              wsId={wsId}
                              theme="auto"
                              className="flex w-full items-center justify-center gap-2"
                            >
                              <ButtonIcon className="h-5 w-5" />
                              {buttonConfig.text}
                            </PurchaseLink>
                          </Button>
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

            {/* Footer Note */}
            <div className="mt-8 flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-6">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t('plan-desc')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
