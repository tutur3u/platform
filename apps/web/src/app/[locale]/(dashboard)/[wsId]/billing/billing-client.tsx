'use client';

import { Button } from '@tuturuuu/ui/button';
import { ArrowUpCircle, CheckCircle, CreditCard } from 'lucide-react';
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
}

interface BillingClientProps {
  currentPlan: Plan;
  upgradePlans: UpgradePlan[];
}

export function BillingClient({
  currentPlan,
  upgradePlans,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);

  // Function to handle plan upgrade
  const handleUpgradePlan = (planId: string) => {
    console.log(`Upgrading to plan: ${planId}`);
    // In a real application, this would navigate to checkout or process the upgrade
    alert(`Plan upgrade to ${planId} will be processed. This is a demo.`);
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

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="col-span-2">
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

            <div className="mb-6 grid grid-cols-2 gap-4">
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

            <div className="mb-6">
              <h4 className="mb-2 font-medium text-card-foreground">
                Features:
              </h4>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {currentPlan.features?.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-center text-card-foreground"
                  >
                    <CheckCircle className="mr-2 h-5 w-5 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => setShowUpgradeOptions(!showUpgradeOptions)}
                className="flex items-center"
              >
                <ArrowUpCircle className="mr-1 h-5 w-5" />
                {showUpgradeOptions ? 'Hide Options' : 'Upgrade Plan'}
              </Button>
              <Button variant="outline" className="border-border">
                Cancel Subscription
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-accent/30 p-6">
            <h3 className="mb-4 text-lg font-semibold text-card-foreground">
              Payment Method
            </h3>
            <div className="mb-4 flex items-center">
              <CreditCard className="mr-3 h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-card-foreground">
                  Visa ending in 4242
                </p>
                <p className="text-sm text-muted-foreground">Expires 05/2025</p>
              </div>
            </div>
            <div className="mt-6">
              <Button
                variant="outline"
                size="sm"
                className="text-sm font-medium"
              >
                Update payment method
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
                  <Button
                    onClick={() => handleUpgradePlan(plan.id)}
                    className={`w-full ${
                      plan.popular
                        ? ''
                        : 'border-primary bg-transparent text-primary hover:bg-primary/10'
                    }`}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    Select {plan.name}
                  </Button>
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
