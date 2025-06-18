'use client';

import PurchaseLink from './data-polar-checkout';
import { Button } from '@tuturuuu/ui/button';
import { ArrowUpCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

// Define types for the props we're passing from the server component
interface Plan {
  name: string;
  price: string;
  billingCycle: string;
  startDate?: string;
  nextBillingDate?: string;
  status?: string;
  features?: string[];
}

interface UpgradePlan {
  id: string;
  name: string;
  price: string;
  billingCycle: string;
  popular: boolean;
  features: string[];
  isEnterprise?: boolean;
}

interface BillingClientProps {
  currentPlan: Plan;
  upgradePlans: UpgradePlan[];
  wsId: string;
  product_id: string;
  isCreator: boolean;
  activeSubscriptionId?: string;
}

export function BillingClient({
  currentPlan,
  upgradePlans,
  wsId,
  isCreator,
  product_id,
  activeSubscriptionId,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleCancelSubscription = async () => {
    setIsLoading(true);
    setMessage('');

    const response = await fetch(`/api/${wsId}/${product_id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({ polarSubscriptionId: activeSubscriptionId }),
    });

    setIsLoading(false);

    if (response.ok) {
      setMessage(
        'Your subscription will be canceled at the end of your billing period.'
      );
      // Reload the page to show the updated subscription status
      window.location.reload();
    } else {
      const errorData = await response.json();
      setMessage(
        `Error: ${errorData.error || 'Could not cancel subscription.'}`
      );
    }
  };

  return (
    <>
      {/* Current Plan Card */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-card-foreground">
              Current Plan
            </h2>
            <p className="text-muted-foreground">Your subscription details</p>
          </div>
          <div className="flex items-center">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                currentPlan.status === 'active'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}
            >
              {currentPlan.status === 'active' ? 'Active' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div>
            <div className="mb-6">
              <h3 className="mb-1 text-xl font-bold text-card-foreground">
                {currentPlan.name}
              </h3>
              <p className="text-2xl font-bold text-primary">
                {currentPlan.price}
                <span className="text-sm text-muted-foreground">
                  /{currentPlan.billingCycle}
                </span>
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium text-card-foreground">
                  {currentPlan.startDate}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Next Billing Date
                </p>
                <p className="font-medium text-card-foreground">
                  {currentPlan.nextBillingDate}
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h4 className="mb-4 font-medium text-card-foreground">
                Plan Features:
              </h4>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {currentPlan.features?.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-center text-card-foreground"
                  >
                    <CheckCircle className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {message && (
              <div
                className={`mb-4 rounded-lg p-3 text-sm ${
                  message.includes('Error')
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                }`}
              >
                {message}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!isCreator}
                onClick={() => setShowUpgradeOptions(!showUpgradeOptions)}
                className="flex items-center"
                size="lg"
              >
                <ArrowUpCircle className="mr-2 h-5 w-5" />
                {showUpgradeOptions ? 'Hide Upgrade Options' : 'Upgrade Plan'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-border"
                onClick={handleCancelSubscription}
                disabled={isLoading || !activeSubscriptionId}
              >
                {isLoading ? 'Cancelling...' : 'Cancel Subscription'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Options */}
      {showUpgradeOptions && (
        <div className="mb-8 rounded-lg border-2 border-primary/20 bg-card p-8 shadow-sm dark:bg-card/80">
          <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
            Upgrade Options
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {upgradePlans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-lg border transition-shadow hover:shadow-md ${
                  plan.popular ? 'relative border-primary' : 'border-border'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 rounded-tr-md rounded-bl-lg bg-primary px-3 py-1 text-xs text-primary-foreground">
                    RECOMMENDED
                  </div>
                )}
                <div className="p-6">
                  <h3 className="mb-1 text-xl font-bold text-card-foreground">
                    {plan.name}
                  </h3>
                  <p className="mb-4 text-2xl font-bold text-primary">
                    {plan.price}
                    <span className="text-sm text-muted-foreground">
                      /{plan.billingCycle}
                    </span>
                  </p>
                  <ul className="mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="mb-2 flex items-start">
                        <CheckCircle className="mt-0.5 mr-2 h-5 w-5 flex-shrink-0 text-primary" />
                        <span className="text-card-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.isEnterprise ? (
                    <Button className="w-full" variant="outline" disabled>
                      Contact Sales
                    </Button>
                  ) : (
                    <Button
                      variant={plan.popular ? 'default' : 'outline'}
                      className={`w-full ${
                        plan.popular
                          ? ''
                          : 'border-primary bg-transparent text-primary hover:bg-primary/10'
                      }`}
                      asChild
                    >
                      <PurchaseLink
                        productId={plan.id}
                        wsId={wsId}
                        customerEmail="t@test.com"
                        theme="auto"
                        className="flex w-full items-center justify-center"
                      >
                        Select {plan.name}
                      </PurchaseLink>
                    </Button>
                  )}
                  {plan.isEnterprise && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Please contact our sales team for Enterprise pricing
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            * Upgrading your plan will take effect immediately. You'll be
            charged the prorated amount for the remainder of your current
            billing cycle.
          </p>
        </div>
      )}
    </>
  );
}
