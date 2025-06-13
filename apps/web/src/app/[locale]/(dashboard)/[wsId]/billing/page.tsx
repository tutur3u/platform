'use client';

import { Checkout } from '@polar-sh/nextjs';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpCircle,
  CalendarDays,
  CheckCircle,
  CreditCard,
  Gem,
  Receipt,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

export default function BillingPage() {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);

  // Motion variants
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.15,
        duration: 0.8,
        ease: 'easeOut',
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
  };

  const cardVariants = {
    hidden: { scale: 0.95, opacity: 0, y: 20 },
    show: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
    hover: {
      scale: 1.03,
      y: -5,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 10,
      },
    },
  };

  // Mock current plan data
  const currentPlan = {
    name: 'Pro',
    price: '$19.99',
  };

  // Mock plan history
  const planHistory = [
    {
      planName: 'Pro',
      price: '$19.99',
      startDate: 'Jan 1, 2023',
      endDate: 'Dec 31, 2023',
      status: 'active',
    },
    {
      planName: 'Basic',
      price: '$9.99',
      startDate: 'Jan 1, 2022',
      endDate: 'Dec 31, 2022',
      status: 'inactive',
    },
  ];

  // Mock payment history
  const paymentHistory = [
    {
      id: 'INV-2023-06',
      date: 'Jun 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-05',
      date: 'May 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-04',
      date: 'Apr 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-03',
      date: 'Mar 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-02',
      date: 'Feb 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2023-01',
      date: 'Jan 15, 2023',
      amount: '$19.99',
      status: 'Paid',
    },
    {
      id: 'INV-2022-12',
      date: 'Dec 15, 2022',
      amount: '$9.99',
      status: 'Paid',
    },
    {
      id: 'INV-2022-11',
      date: 'Nov 15, 2022',
      amount: '$9.99',
      status: 'Paid',
    },
    {
      id: 'INV-2022-10',
      date: 'Oct 15, 2022',
      amount: '$9.99',
      status: 'Paid',
    },
  ];

  // Function to handle plan upgrade
  const handleUpgradePlan = (planId: string) => {
    console.log(`Upgrading to plan: ${planId}`);
    // In a real application, this would navigate to checkout or process the upgrade
    alert(`Plan upgrade to ${planId} will be processed. This is a demo.`);
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mb-8 text-muted-foreground">
        Manage your billing information and subscriptions here.
      </p>

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
                Upgrade Plan
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

      {/* Plan History */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Plan History
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Plan
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  End Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {planHistory?.map((plan, index) => (
                <tr key={index}>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.planName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.price}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.startDate}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {plan.endDate || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${
                        plan.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {plan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Payment History
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paymentHistory.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {payment.id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {payment.date}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-card-foreground">
                    {payment.amount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${
                        payment.status === 'Paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      className="text-primary hover:text-primary/80"
                      title="Download Receipt"
                    >
                      <Receipt className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
