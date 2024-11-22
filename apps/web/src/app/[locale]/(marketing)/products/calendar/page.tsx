'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  Calendar,
  Clock,
  Globe,
  Link,
  Mail,
  MessageSquare,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
  Video,
  Zap,
} from 'lucide-react';

const features = [
  {
    title: 'Smart Scheduling',
    description:
      'Intelligent scheduling suggestions based on availability and preferences.',
    icon: <Clock className="h-6 w-6" />,
  },
  {
    title: 'Team Coordination',
    description:
      'Easily coordinate meetings and events across teams and time zones.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    title: 'Video Integration',
    description:
      'Seamless integration with popular video conferencing platforms.',
    icon: <Video className="h-6 w-6" />,
  },
  {
    title: 'Mobile Access',
    description:
      'Access your calendar on any device with our mobile-responsive design.',
    icon: <Smartphone className="h-6 w-6" />,
  },
  {
    title: 'Meeting Links',
    description:
      'Generate and share custom booking links for easy appointment scheduling.',
    icon: <Link className="h-6 w-6" />,
  },
  {
    title: 'Email Notifications',
    description:
      'Automated reminders and updates for all your scheduled events.',
    icon: <Mail className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Team Collaboration',
    items: [
      'Meeting scheduling',
      'Team availability',
      'Project timelines',
      'Resource booking',
    ],
  },
  {
    title: 'Client Management',
    items: [
      'Appointment booking',
      'Consultation slots',
      'Follow-up scheduling',
      'Client reminders',
    ],
  },
  {
    title: 'Event Planning',
    items: [
      'Event coordination',
      'Venue scheduling',
      'Attendee management',
      'Calendar sharing',
    ],
  },
];

export default function CalendarProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Smart Calendar Management</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Streamline your scheduling and time management with our intelligent
          calendar system. Coordinate meetings, manage events, and boost
          productivity across teams.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" disabled>
            Join Waitlist
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/contact">Contact Sales</a>
          </Button>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="text-primary h-12 w-12" />
            <h2 className="text-2xl font-bold">Enterprise-Ready Calendar</h2>
            <p className="text-muted-foreground">
              Built with security and scalability in mind, our calendar system
              supports organizations of all sizes while maintaining data privacy
              and compliance.
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
              <Calendar className="text-primary mb-4 h-8 w-8" />
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

      {/* Integration Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-b-0 md:border-r">
              <Globe className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Global Accessibility</h3>
              <p className="text-muted-foreground">
                Access your calendar from anywhere, with automatic time zone
                adjustments and cross-platform synchronization.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Share2 className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Seamless Integration</h3>
              <p className="text-muted-foreground">
                Connect with your favorite tools and services for a unified
                workflow experience.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Communication Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Enhanced Communication
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <MessageSquare className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Meeting Chat</h3>
            <p className="text-muted-foreground">
              Built-in chat functionality for quick discussions and meeting
              coordination.
            </p>
          </Card>
          <Card className="p-6">
            <Zap className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Quick Actions</h3>
            <p className="text-muted-foreground">
              Streamlined workflows with one-click actions for common calendar
              operations.
            </p>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-bold">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-8">
            Join the waitlist to be among the first to experience our smart
            calendar management system when it launches.
          </p>
          <Button size="lg" className="min-w-[200px]" disabled>
            Join Waitlist
          </Button>
        </div>
      </section>
    </div>
  );
}
