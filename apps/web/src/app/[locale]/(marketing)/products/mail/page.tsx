'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  AlertCircle,
  Archive,
  Bot,
  Calendar,
  Clock,
  Filter,
  Inbox,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    title: 'Smart Inbox',
    description:
      'Intelligent email organization with priority inbox and auto-categorization.',
    icon: <Inbox className="h-6 w-6" />,
  },
  {
    title: 'AI Assistant',
    description:
      'AI-powered email composition, scheduling, and response suggestions.',
    icon: <Bot className="h-6 w-6" />,
  },
  {
    title: 'Advanced Search',
    description:
      'Powerful search capabilities with filters and natural language processing.',
    icon: <Search className="h-6 w-6" />,
  },
  {
    title: 'Calendar Integration',
    description:
      'Seamless calendar scheduling and meeting coordination from your inbox.',
    icon: <Calendar className="h-6 w-6" />,
  },
  {
    title: 'Email Tracking',
    description:
      'Track email opens, link clicks, and engagement with detailed analytics.',
    icon: <AlertCircle className="h-6 w-6" />,
  },
  {
    title: 'Mobile Access',
    description:
      'Access your email on any device with our responsive mobile application.',
    icon: <Smartphone className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Business Communication',
    items: [
      'Team collaboration',
      'Client correspondence',
      'Project updates',
      'Document sharing',
    ],
  },
  {
    title: 'Email Management',
    items: [
      'Priority inbox',
      'Spam protection',
      'Email filtering',
      'Archive system',
    ],
  },
  {
    title: 'Productivity Tools',
    items: [
      'Email templates',
      'Scheduled sending',
      'Follow-up reminders',
      'Task management',
    ],
  },
];

export default function MailProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Smart Email Management</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Transform your email experience with AI-powered organization,
          intelligent filtering, and seamless integration with your workflow.
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
              Your emails and data are protected with advanced encryption, spam
              filtering, and comprehensive security measures.
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
              <Mail className="text-primary mb-4 h-8 w-8" />
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

      {/* Management Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-r md:border-b-0">
              <Filter className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Smart Filtering</h3>
              <p className="text-muted-foreground">
                Automatically organize your inbox with intelligent filters and
                custom rules for efficient email management.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Archive className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Email Archive</h3>
              <p className="text-muted-foreground">
                Keep your inbox clean with smart archiving and easy retrieval of
                historical emails when needed.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Communication Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Send className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Smart Compose</h3>
            <p className="text-muted-foreground">
              Write emails faster with AI-powered suggestions and smart
              templates for common responses.
            </p>
          </Card>
          <Card className="p-6">
            <Clock className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Scheduled Sending</h3>
            <p className="text-muted-foreground">
              Schedule emails to be sent at the perfect time for maximum impact
              and engagement.
            </p>
          </Card>
        </div>
      </section>

      {/* Analytics Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-r md:border-b-0">
              <LayoutDashboard className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Email Analytics</h3>
              <p className="text-muted-foreground">
                Gain insights into your email patterns and communication
                effectiveness with detailed analytics.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <MessagesSquare className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Team Collaboration</h3>
              <p className="text-muted-foreground">
                Work together efficiently with shared inboxes, delegated access,
                and team communication tools.
              </p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
