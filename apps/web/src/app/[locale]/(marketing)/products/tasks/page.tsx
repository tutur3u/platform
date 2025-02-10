'use client';

import { Badge } from '@tutur3u/ui/components/ui/badge';
import { Button } from '@tutur3u/ui/components/ui/button';
import { Card } from '@tutur3u/ui/components/ui/card';
import {
  Bell,
  Bot,
  Calendar,
  CircleCheck,
  Clock,
  FolderKanban,
  LayoutDashboard,
  LineChart,
  ListTodo,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    title: 'Task Organization',
    description:
      'Organize tasks with custom lists, tags, and priority levels for better workflow management.',
    icon: <ListTodo className="h-6 w-6" />,
  },
  {
    title: 'AI Task Assistant',
    description:
      'Get intelligent suggestions for task prioritization and time management.',
    icon: <Bot className="h-6 w-6" />,
  },
  {
    title: 'Team Collaboration',
    description:
      'Assign tasks, track progress, and collaborate with team members seamlessly.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    title: 'Due Date Tracking',
    description:
      'Set and track due dates with smart reminders and calendar integration.',
    icon: <Calendar className="h-6 w-6" />,
  },
  {
    title: 'Project Views',
    description:
      'View tasks in multiple formats including list, board, and timeline views.',
    icon: <FolderKanban className="h-6 w-6" />,
  },
  {
    title: 'Task Analytics',
    description:
      'Track productivity and task completion with detailed analytics and reports.',
    icon: <LineChart className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Personal Tasks',
    items: [
      'Daily to-do lists',
      'Goal tracking',
      'Habit management',
      'Priority planning',
    ],
  },
  {
    title: 'Team Projects',
    items: [
      'Project coordination',
      'Task delegation',
      'Progress tracking',
      'Team collaboration',
    ],
  },
  {
    title: 'Workflow Management',
    items: [
      'Process automation',
      'Deadline tracking',
      'Resource allocation',
      'Status reporting',
    ],
  },
];

export default function TasksProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Smart Task Management</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Transform your productivity with intelligent task management.
          Organize, prioritize, and complete tasks efficiently with AI-powered
          assistance and team collaboration features.
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
              Your tasks and project data are protected with advanced security
              measures, ensuring safe and reliable task management for teams of
              all sizes.
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
              <CircleCheck className="text-primary mb-4 h-8 w-8" />
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

      {/* Task Management Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-b-0 md:border-r">
              <Tag className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Smart Organization</h3>
              <p className="text-muted-foreground">
                Organize tasks with custom tags, labels, and categories for
                efficient task management and quick access.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Bell className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Intelligent Reminders</h3>
              <p className="text-muted-foreground">
                Never miss a deadline with smart notifications and
                priority-based reminders for important tasks.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Productivity Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <LayoutDashboard className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Custom Dashboards</h3>
            <p className="text-muted-foreground">
              Create personalized dashboards to track tasks, deadlines, and team
              progress at a glance.
            </p>
          </Card>
          <Card className="p-6">
            <Clock className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Time Tracking</h3>
            <p className="text-muted-foreground">
              Track time spent on tasks and analyze productivity patterns with
              detailed time analytics.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
