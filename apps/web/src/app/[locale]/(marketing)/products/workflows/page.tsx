'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Bot,
  Braces,
  GitBranch,
  History,
  Layers,
  PlayCircle,
  Settings,
  ShieldCheck,
  TimerReset,
  Workflow,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    title: 'Visual Workflow Builder',
    description:
      'Create complex workflows with an intuitive drag-and-drop interface.',
    icon: <Workflow className="h-6 w-6" />,
  },
  {
    title: 'Automation Rules',
    description:
      'Set up conditional logic and triggers for automated process execution.',
    icon: <Zap className="h-6 w-6" />,
  },
  {
    title: 'Process Templates',
    description:
      'Start quickly with pre-built templates for common business processes.',
    icon: <Layers className="h-6 w-6" />,
  },
  {
    title: 'Version Control',
    description:
      'Track changes and maintain different versions of your workflows.',
    icon: <GitBranch className="h-6 w-6" />,
  },
  {
    title: 'AI Optimization',
    description:
      'Optimize workflows automatically with AI-powered suggestions.',
    icon: <Bot className="h-6 w-6" />,
  },
  {
    title: 'Custom Integration',
    description:
      'Connect with your existing tools and systems via custom APIs.',
    icon: <Braces className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Business Processes',
    items: [
      'Approval workflows',
      'Document processing',
      'Employee onboarding',
      'Purchase orders',
    ],
  },
  {
    title: 'Team Automation',
    items: [
      'Task assignment',
      'Project handoffs',
      'Status updates',
      'Team notifications',
    ],
  },
  {
    title: 'System Integration',
    items: [
      'Data synchronization',
      'API workflows',
      'Custom triggers',
      'Event processing',
    ],
  },
];

export default function WorkflowsProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Workflow Automation</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Transform your business processes with intelligent workflow
          automation. Design, automate, and optimize your workflows with our
          powerful visual builder and AI-powered suggestions.
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
            <h2 className="text-2xl font-bold">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Your workflows and business processes are protected with advanced
              security measures and compliance controls, ensuring safe and
              reliable automation.
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
              <Workflow className="mb-4 h-8 w-8 text-primary" />
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

      {/* Automation Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="flex flex-col justify-center gap-4 border-b border-border p-8 md:border-r md:border-b-0">
              <PlayCircle className="h-8 w-8 text-primary" />
              <h3 className="text-2xl font-bold">One-Click Automation</h3>
              <p className="text-muted-foreground">
                Deploy and run workflows with a single click, monitoring their
                execution in real-time with detailed analytics.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <TimerReset className="h-8 w-8 text-primary" />
              <h3 className="text-2xl font-bold">Scheduled Triggers</h3>
              <p className="text-muted-foreground">
                Schedule workflows to run automatically based on time, events,
                or custom conditions with advanced timing controls.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Process Management
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Settings className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 text-xl font-bold">Advanced Configuration</h3>
            <p className="text-muted-foreground">
              Fine-tune your workflows with detailed configuration options and
              custom parameters for maximum flexibility.
            </p>
          </Card>
          <Card className="p-6">
            <History className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 text-xl font-bold">Execution History</h3>
            <p className="text-muted-foreground">
              Track and audit workflow executions with comprehensive logs and
              performance metrics for optimization.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
