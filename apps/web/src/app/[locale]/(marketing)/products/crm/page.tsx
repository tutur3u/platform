'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  BarChart3,
  Building,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  MessageSquare,
  PieChart,
  Settings,
  ShieldCheck,
  Tag,
  Target,
  Users,
} from '@tuturuuu/ui/icons';
import Link from 'next/link';

const features = [
  {
    title: 'Contact Management',
    description:
      'Organize and track customer interactions with detailed contact profiles.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    title: 'Sales Pipeline',
    description:
      'Visualize and manage your sales process from lead to conversion.',
    icon: <Target className="h-6 w-6" />,
  },
  {
    title: 'Communication Tracking',
    description:
      'Keep track of all customer communications in one centralized place.',
    icon: <MessageSquare className="h-6 w-6" />,
  },
  {
    title: 'Deal Management',
    description:
      'Track and manage deals through various stages of your sales pipeline.',
    icon: <Tag className="h-6 w-6" />,
  },
  {
    title: 'Analytics & Reporting',
    description:
      'Get insights into your sales performance with detailed analytics.',
    icon: <BarChart3 className="h-6 w-6" />,
  },
  {
    title: 'Workflow Automation',
    description:
      'Automate repetitive tasks and streamline your sales processes.',
    icon: <Settings className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Sales Teams',
    items: [
      'Lead tracking',
      'Pipeline management',
      'Performance metrics',
      'Sales forecasting',
    ],
  },
  {
    title: 'Customer Service',
    items: [
      'Case management',
      'Support tracking',
      'Customer feedback',
      'Service analytics',
    ],
  },
  {
    title: 'Business Growth',
    items: [
      'Customer insights',
      'Market analysis',
      'Revenue tracking',
      'Growth planning',
    ],
  },
];

export default function CRMProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">
          Customer Relationship Management
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Build stronger customer relationships and drive business growth with
          our intelligent CRM platform. Streamline sales, track interactions,
          and make data-driven decisions.
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
              Your customer data is protected with industry-leading security
              measures and compliance standards, ensuring confidentiality and
              trust.
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
              <Building className="text-primary mb-4 h-8 w-8" />
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

      {/* Analytics Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-b-0 md:border-r">
              <LayoutDashboard className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Insightful Dashboard</h3>
              <p className="text-muted-foreground">
                Get a comprehensive view of your customer relationships with
                customizable dashboards and real-time analytics.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <PieChart className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Performance Metrics</h3>
              <p className="text-muted-foreground">
                Track key performance indicators and make data-driven decisions
                to improve customer relationships.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Business Growth Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <FileText className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Smart Documents</h3>
            <p className="text-muted-foreground">
              Generate and manage customer-related documents with intelligent
              templates and automation.
            </p>
          </Card>
          <Card className="p-6">
            <HeartHandshake className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Customer Success</h3>
            <p className="text-muted-foreground">
              Build lasting relationships with tools designed to track and
              improve customer satisfaction.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
