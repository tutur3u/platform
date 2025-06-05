'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Brain,
  FileSearch,
  Fingerprint,
  Languages,
  LineChart,
  MessageSquareCode,
  Sparkles,
  Zap,
} from '@tuturuuu/ui/icons';
import Link from 'next/link';

const features = [
  {
    title: 'Natural Language Processing',
    description:
      'Understand and process human language with advanced AI models for better communication and automation.',
    icon: <Languages className="h-6 w-6" />,
  },
  {
    title: 'Smart Document Analysis',
    description:
      'Extract insights and data from documents automatically with AI-powered processing.',
    icon: <FileSearch className="h-6 w-6" />,
  },
  {
    title: 'Predictive Analytics',
    description:
      'Make data-driven decisions with AI-powered forecasting and trend analysis.',
    icon: <LineChart className="h-6 w-6" />,
  },
  {
    title: 'Code Generation',
    description:
      'Automate coding tasks and generate boilerplate code with AI assistance.',
    icon: <MessageSquareCode className="h-6 w-6" />,
  },
  {
    title: 'Intelligent Automation',
    description:
      'Streamline workflows with AI-powered process automation and optimization.',
    icon: <Zap className="h-6 w-6" />,
  },
  {
    title: 'Personalized Insights',
    description:
      'Get tailored recommendations and insights based on your business data.',
    icon: <Sparkles className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Document Processing',
    items: [
      'Extract key information from documents',
      'Automate data entry',
      'Classify and organize files',
      'Generate document summaries',
    ],
  },
  {
    title: 'Business Intelligence',
    items: [
      'Market trend analysis',
      'Customer behavior prediction',
      'Revenue forecasting',
      'Risk assessment',
    ],
  },
  {
    title: 'Workflow Automation',
    items: [
      'Task prioritization',
      'Smart scheduling',
      'Process optimization',
      'Automated reporting',
    ],
  },
];

export default function AIProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">AI-Powered Solutions</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Transform your business operations with intelligent automation and
          data-driven insights powered by cutting-edge artificial intelligence.
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
            <Fingerprint className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Our AI solutions are built with security and privacy in mind. All
              data is encrypted and processed in compliance with industry
              standards and regulations.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Intelligent Features
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
              <Brain className="mb-4 h-8 w-8 text-primary" />
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
    </div>
  );
}
