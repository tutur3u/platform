'use client';

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
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Current Plan</h2>
            <p className="text-gray-500">Your subscription details</p>
          </div>
          <div className="flex items-center">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                currentPlan.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {currentPlan.status === 'active' ? 'Active' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="col-span-2">
            <div className="mb-6">
              <h3 className="mb-1 text-xl font-bold">{currentPlan.name}</h3>
              <p className="text-2xl font-bold text-blue-600">
                {currentPlan.price}
                <span className="text-sm text-gray-500">
                  /{currentPlan.billingCycle}
                </span>
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Start Date</p>
                <p className="font-medium">{currentPlan.startDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Next Billing Date</p>
                <p className="font-medium">{currentPlan.nextBillingDate}</p>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="mb-2 font-medium">Features:</h4>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {currentPlan.features?.map((feature, index) => (
                  <li key={index} className="flex items-center">
                    <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setShowUpgradeOptions(!showUpgradeOptions)}
                className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                <ArrowUpCircle className="mr-1 h-5 w-5" />
                Upgrade Plan
              </button>
              <button className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50">
                Cancel Subscription
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
            <h3 className="mb-4 text-lg font-semibold">Payment Method</h3>
            <div className="mb-4 flex items-center">
              <CreditCard className="mr-3 h-8 w-8 text-gray-500" />
              <div>
                <p className="font-medium">Visa ending in 4242</p>
                <p className="text-sm text-gray-500">Expires 05/2025</p>
              </div>
            </div>
            <div className="mt-6">
              <button className="text-sm font-medium text-blue-600 hover:text-blue-800">
                Update payment method
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Options */}
      {showUpgradeOptions && (
        <div className="mb-8 rounded-lg border-2 border-blue-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-semibold">Upgrade Options</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {upgradePlans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-lg border p-6 transition-shadow hover:shadow-md ${
                  plan.popular ? 'relative border-blue-500' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 rounded-tr-md rounded-bl-lg bg-blue-500 px-3 py-1 text-xs text-white">
                    RECOMMENDED
                  </div>
                )}
                <h3 className="mb-1 text-xl font-bold">{plan.name}</h3>
                <p className="mb-4 text-2xl font-bold text-blue-600">
                  {plan.price}
                  <span className="text-sm text-gray-500">
                    /{plan.billingCycle}
                  </span>
                </p>
                <ul className="mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="mb-2 flex items-start">
                      <CheckCircle className="mt-0.5 mr-2 h-5 w-5 flex-shrink-0 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgradePlan(plan.id)}
                  className={`w-full rounded-md px-4 py-2 ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-blue-600 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Select {plan.name}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-gray-500">
            * Upgrading your plan will take effect immediately. You'll be
            charged the prorated amount for the remainder of your current
            billing cycle.
          </p>
        </div>
      )}

      {/* Plan History */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h2 className="mb-6 text-2xl font-semibold">Plan History</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Plan
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  End Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {planHistory?.map((plan, index) => (
                <tr key={index}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {plan.planName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{plan.price}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {plan.startDate}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {plan.endDate || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${
                        plan.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
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
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h2 className="mb-6 text-2xl font-semibold">Payment History</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium tracking-wider text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paymentHistory.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{payment.id}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {payment.date}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {payment.amount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs leading-5 font-semibold ${
                        payment.status === 'Paid'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      className="text-blue-600 hover:text-blue-800"
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
