'use client';

import {
  AlertCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  Shield,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/payment/polar';
import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';
import { PlanList } from './plan-list';

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
  products: Product[];
  product_id: string;
  isCreator: boolean;
  activeSubscriptionId?: string;
}

export function BillingClient({
  currentPlan,
  products,
  wsId,
  isCreator,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const t = useTranslations('billing');
  const router = useRouter();

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
        <PlanList currentPlan={currentPlan} products={products} wsId={wsId} />
      )}
    </div>
  );
}
