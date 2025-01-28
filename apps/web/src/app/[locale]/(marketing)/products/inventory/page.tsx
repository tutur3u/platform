'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  BarChart3,
  Box,
  Boxes,
  Building2,
  History,
  PackageSearch,
  QrCode,
  RefreshCw,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    title: 'Stock Management',
    description:
      'Track and manage inventory levels with real-time updates and alerts.',
    icon: <Boxes className="h-6 w-6" />,
  },
  {
    title: 'Order Processing',
    description:
      'Streamline purchase orders and manage supplier relationships efficiently.',
    icon: <Box className="h-6 w-6" />,
  },
  {
    title: 'Barcode & QR Scanning',
    description:
      'Quick and accurate item tracking with integrated scanning capabilities.',
    icon: <QrCode className="h-6 w-6" />,
  },
  {
    title: 'Warehouse Management',
    description:
      'Organize multiple warehouses and track stock movement between locations.',
    icon: <Warehouse className="h-6 w-6" />,
  },
  {
    title: 'Analytics & Reports',
    description:
      'Generate detailed reports on inventory performance and trends.',
    icon: <BarChart3 className="h-6 w-6" />,
  },
  {
    title: 'Automated Reordering',
    description: 'Set up automatic reordering based on minimum stock levels.',
    icon: <RefreshCw className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Retail Management',
    items: [
      'Stock tracking',
      'Sales integration',
      'Supplier management',
      'Order processing',
    ],
  },
  {
    title: 'Distribution',
    items: [
      'Warehouse organization',
      'Order fulfillment',
      'Shipping management',
      'Location tracking',
    ],
  },
  {
    title: 'Manufacturing',
    items: [
      'Raw materials tracking',
      'Production planning',
      'Quality control',
      'Cost management',
    ],
  },
];

export default function InventoryProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Smart Inventory Management</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Transform your inventory operations with our intelligent management
          system. Track stock, automate orders, and optimize your supply chain
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
            <ShieldCheck className="text-primary h-12 w-12" />
            <h2 className="text-2xl font-bold">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Your inventory data is protected with advanced security measures,
              ensuring safe and reliable stock management across your
              organization.
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
              <Building2 className="text-primary mb-4 h-8 w-8" />
              <h3 className="mb-4 text-xl font-semibold">{useCase.title}</h3>
              <ul className="text-muted-foreground space-y-2">
                {useCase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Supply Chain Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-r md:border-b-0">
              <Truck className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Supply Chain Visibility</h3>
              <p className="text-muted-foreground">
                Get complete visibility into your supply chain with real-time
                tracking and automated notifications for stock movements.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <PackageSearch className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Inventory Insights</h3>
              <p className="text-muted-foreground">
                Make informed decisions with detailed analytics on stock levels,
                turnover rates, and demand forecasting.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Operations Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Settings className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Process Automation</h3>
            <p className="text-muted-foreground">
              Automate routine tasks like reordering, stock counts, and report
              generation to save time and reduce errors.
            </p>
          </Card>
          <Card className="p-6">
            <History className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Audit Trail</h3>
            <p className="text-muted-foreground">
              Maintain detailed records of all inventory movements and changes
              for compliance and accountability.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
