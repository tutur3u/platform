'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  BarChart3,
  Calculator,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  LineChart,
  LockKeyhole,
  PieChart,
  Receipt,
  ShieldCheck,
  Wallet,
  Wallet2,
} from '@tuturuuu/ui/icons';
import Link from 'next/link';

const features = [
  {
    title: 'Expense Tracking',
    description:
      'Track and categorize expenses with automated receipt processing.',
    icon: <Receipt className="h-6 w-6" />,
  },
  {
    title: 'Budget Management',
    description: 'Create and monitor budgets with real-time spending insights.',
    icon: <Wallet className="h-6 w-6" />,
  },
  {
    title: 'Financial Reports',
    description: 'Generate comprehensive financial reports and analytics.',
    icon: <FileSpreadsheet className="h-6 w-6" />,
  },
  {
    title: 'Payment Processing',
    description: 'Handle payments and transactions with secure integrations.',
    icon: <CreditCard className="h-6 w-6" />,
  },
  {
    title: 'Cash Flow Analysis',
    description: 'Monitor and forecast cash flow with advanced analytics.',
    icon: <LineChart className="h-6 w-6" />,
  },
  {
    title: 'Financial Planning',
    description:
      'Plan and optimize your financial strategy with AI-powered insights.',
    icon: <Calculator className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Business Finance',
    items: [
      'Expense management',
      'Budget tracking',
      'Financial reporting',
      'Cash flow analysis',
    ],
  },
  {
    title: 'Personal Finance',
    items: [
      'Spending tracking',
      'Savings goals',
      'Investment monitoring',
      'Budget planning',
    ],
  },
  {
    title: 'Financial Planning',
    items: [
      'Future projections',
      'Risk assessment',
      'Goal setting',
      'Scenario planning',
    ],
  },
];

export default function FinanceProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Smart Financial Management</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Take control of your finances with our intelligent management system.
          Track expenses, manage budgets, and make informed financial decisions
          with powerful analytics.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" disabled>
            Join Waitlist
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/contact">Contact Sales</Link>
          </Button>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">Bank-Grade Security</h2>
            <p className="text-muted-foreground">
              Your financial data is protected with state-of-the-art encryption
              and security measures, ensuring safe and reliable financial
              management.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Powerful Features
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-primary">{feature.icon}</div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
              </div>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">Use Cases</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {useCases.map((useCase) => (
            <Card key={useCase.title} className="p-6">
              <Wallet2 className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-4 text-xl font-semibold">{useCase.title}</h3>
              <ul className="space-y-2 text-muted-foreground">
                {useCase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Analytics Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="flex flex-col justify-center gap-4 border-b border-border p-8 md:border-r md:border-b-0">
              <BarChart3 className="h-8 w-8 text-primary" />
              <h3 className="text-2xl font-bold">Financial Analytics</h3>
              <p className="text-muted-foreground">
                Gain deep insights into your financial health with comprehensive
                analytics and customizable dashboards.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <PieChart className="h-8 w-8 text-primary" />
              <h3 className="text-2xl font-bold">Expense Insights</h3>
              <p className="text-muted-foreground">
                Visualize spending patterns and identify opportunities for
                optimization with detailed expense breakdowns.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Financial Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <LockKeyhole className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 text-xl font-bold">Secure Transactions</h3>
            <p className="text-muted-foreground">
              Process payments and manage transactions with enterprise-grade
              security and real-time monitoring.
            </p>
          </Card>
          <Card className="p-6">
            <DollarSign className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 text-xl font-bold">Smart Budgeting</h3>
            <p className="text-muted-foreground">
              Create and manage budgets with AI-powered recommendations and
              automated tracking.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
