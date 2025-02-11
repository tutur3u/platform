'use client';

import { Badge } from '@tutur3u/ui/badge';
import { Button } from '@tutur3u/ui/button';
import { Card } from '@tutur3u/ui/card';
import {
  Award,
  BookOpen,
  Brain,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Medal,
  MessageSquare,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    title: 'Course Management',
    description:
      'Create, organize, and deliver engaging courses with rich multimedia content and interactive elements.',
    icon: <BookOpen className="h-6 w-6" />,
  },
  {
    title: 'Progress Tracking',
    description:
      'Monitor student progress, completion rates, and performance with detailed analytics.',
    icon: <LineChart className="h-6 w-6" />,
  },
  {
    title: 'Interactive Learning',
    description:
      'Engage students with quizzes, assignments, and collaborative learning tools.',
    icon: <Brain className="h-6 w-6" />,
  },
  {
    title: 'Video Conferencing',
    description:
      'Conduct live classes, webinars, and one-on-one sessions with integrated video tools.',
    icon: <Video className="h-6 w-6" />,
  },
  {
    title: 'Assessment Tools',
    description:
      'Create and grade assignments, quizzes, and exams with automated scoring.',
    icon: <FileText className="h-6 w-6" />,
  },
  {
    title: 'Discussion Forums',
    description:
      'Foster community learning with moderated discussion boards and peer interactions.',
    icon: <MessageSquare className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Corporate Training',
    items: [
      'Employee onboarding programs',
      'Professional development courses',
      'Compliance training',
      'Skills assessment',
    ],
  },
  {
    title: 'Educational Institutions',
    items: [
      'Online course delivery',
      'Student performance tracking',
      'Virtual classrooms',
      'Resource management',
    ],
  },
  {
    title: 'Training Centers',
    items: [
      'Course catalog management',
      'Certification programs',
      'Progress monitoring',
      'Learning analytics',
    ],
  },
];

export default function LMSProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Learning Management System</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Transform your educational and training programs with our
          comprehensive learning management system. Deliver engaging content,
          track progress, and enhance learning outcomes.
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
            <h2 className="text-2xl font-bold">Certified Learning Platform</h2>
            <p className="text-muted-foreground">
              Our LMS is designed to meet educational standards and compliance
              requirements, ensuring a secure and effective learning environment
              for all users.
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
              <GraduationCap className="mb-4 h-8 w-8 text-primary" />
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
              <LayoutDashboard className="h-8 w-8 text-primary" />
              <h3 className="text-2xl font-bold">Learning Analytics</h3>
              <p className="text-muted-foreground">
                Gain valuable insights into learning patterns, engagement
                levels, and performance metrics with our advanced analytics
                dashboard.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Users className="h-8 w-8 text-primary" />
              <h3 className="text-2xl font-bold">User Management</h3>
              <p className="text-muted-foreground">
                Easily manage learners, instructors, and administrators with
                role-based access control and detailed user profiles.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Achievements Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Learning Achievements
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Award className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 text-xl font-bold">Certifications</h3>
            <p className="text-muted-foreground">
              Issue digital certificates and badges to recognize course
              completion and achievements.
            </p>
          </Card>
          <Card className="p-6">
            <Medal className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 text-xl font-bold">Gamification</h3>
            <p className="text-muted-foreground">
              Motivate learners with points, leaderboards, and rewards for
              completing learning objectives.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
