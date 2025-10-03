'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Database,
  FileText,
  GitBranch,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Lock,
  MessageSquare,
  Rocket,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function MarketingPage() {
  return (
    <main className="relative mx-auto overflow-x-clip">
      {/* Dynamic Floating Orbs */}
      <div className="-z-10 pointer-events-none fixed inset-0">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="-left-32 sm:-left-64 absolute top-0 h-96 w-96 rounded-full bg-gradient-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="-right-32 sm:-right-64 absolute top-[40%] h-80 w-80 rounded-full bg-gradient-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="-bottom-32 -translate-x-1/2 sm:-bottom-64 absolute left-1/2 h-96 w-96 rounded-full bg-gradient-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="-z-10 pointer-events-none fixed inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-32 pb-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <Badge
              variant="secondary"
              className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              The Intelligent OS for Modern Work
            </Badge>

            <h1 className="mb-6 text-balance font-bold text-5xl tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
              Your Life,{' '}
              <span className="bg-gradient-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                In Sync
              </span>
            </h1>

            <p className="mx-auto mb-8 max-w-3xl text-balance text-foreground/70 text-lg leading-relaxed sm:text-xl md:text-2xl">
              Stop juggling apps. Start focusing on what matters.{' '}
              <strong className="text-foreground">Tuturuuu</strong> unifies your
              calendar, tasks, meetings, and communications—powered by AI that
              actually understands your work.
            </p>

            <div className="mb-12 flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" className="group" asChild>
                <Link href="/onboarding">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#features">
                  <Layers className="mr-2 h-5 w-5" />
                  Explore Features
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link
                  href="https://github.com/tutur3u/platform"
                  target="_blank"
                >
                  <GitBranch className="mr-2 h-5 w-5" />
                  View on GitHub
                </Link>
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/60 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                Open Source
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                10,000+ Commits
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                30+ Contributors
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                Free Forever Plan
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Impact Stats Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              The{' '}
              <span className="bg-gradient-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                Digital Friction
              </span>{' '}
              Crisis
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Modern workers are drowning in digital noise. Here's the cost.
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Clock,
                title: '21 Hours Lost',
                subtitle: 'Every Week',
                description:
                  'Average time knowledge workers waste on "work about work" instead of meaningful tasks',
                color: 'red',
                trend: '-21h/week',
              },
              {
                icon: Brain,
                title: '40% Less',
                subtitle: 'Productive Output',
                description:
                  'The mental tax of context-switching between fragmented tools and notifications',
                color: 'orange',
                trend: '-40%',
              },
              {
                icon: TrendingUp,
                title: '$1T+ Lost',
                subtitle: 'Global Productivity',
                description:
                  'Annual cost of digital friction and administrative overhead worldwide',
                color: 'yellow',
                trend: '$1T+/year',
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'h-full p-8 text-center transition-all hover:shadow-lg',
                    `border-dynamic-${stat.color}/30 bg-gradient-to-br from-dynamic-${stat.color}/5 via-background to-background hover:border-dynamic-${stat.color}/50 hover:shadow-dynamic-${stat.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                      `bg-dynamic-${stat.color}/10`
                    )}
                  >
                    <stat.icon
                      className={cn('h-8 w-8', `text-dynamic-${stat.color}`)}
                    />
                  </div>
                  <div
                    className={cn(
                      'mb-2 font-bold text-4xl',
                      `text-dynamic-${stat.color}`
                    )}
                  >
                    {stat.title}
                  </div>
                  <div className="mb-3 font-medium text-foreground/80 text-sm uppercase tracking-wide">
                    {stat.subtitle}
                  </div>
                  <p className="mb-4 text-foreground/60 text-sm leading-relaxed">
                    {stat.description}
                  </p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      `border-dynamic-${stat.color}/30 bg-dynamic-${stat.color}/10 text-dynamic-${stat.color}`
                    )}
                  >
                    {stat.trend}
                  </Badge>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Everything You Need,{' '}
              <span className="bg-gradient-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                One Platform
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Tuturuuu brings together all your productivity tools with
              intelligent AI integration
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Calendar,
                title: 'TuPlan',
                subtitle: 'Smart Calendar',
                description:
                  'AI-powered auto-scheduling that allocates time based on deadlines, priorities, and your personal work rhythms.',
                features: [
                  'Google Calendar sync',
                  'Auto-scheduling',
                  'Time blocking',
                ],
                color: 'blue',
              },
              {
                icon: CheckCircle2,
                title: 'TuDo',
                subtitle: 'Smart Tasks',
                description:
                  'Centralized task hub with hierarchical organization, bucket dump feature, and seamless calendar integration.',
                features: [
                  'Kanban boards',
                  'Hierarchical tasks',
                  'Project management',
                ],
                color: 'green',
              },
              {
                icon: Users,
                title: 'TuMeet',
                subtitle: 'Smart Meetings',
                description:
                  'End-to-end meeting solution with collaborative planning, location intelligence, and AI-generated summaries.',
                features: [
                  'Meeting plans',
                  'AI transcription',
                  'Action tracking',
                ],
                color: 'purple',
              },
              {
                icon: MessageSquare,
                title: 'TuChat',
                subtitle: 'Smart Communications',
                description:
                  'Integrated communications hub where AI surfaces commitments and routes them to tasks and calendar.',
                features: ['Team chat', 'AI insights', 'Auto-routing'],
                color: 'cyan',
              },
              {
                icon: Wallet,
                title: 'TuFinance',
                subtitle: 'Finance Management',
                description:
                  'Track expenses, manage budgets, and gain AI-powered insights into your financial health.',
                features: [
                  'Expense tracking',
                  'Budget planning',
                  'Financial analytics',
                ],
                color: 'green',
              },
              {
                icon: GraduationCap,
                title: 'Nova',
                subtitle: 'Learning Platform',
                description:
                  'Practice prompt engineering, compete in AI challenges, and level up your skills with hands-on learning.',
                features: ['AI challenges', 'Skill tracking', 'Leaderboards'],
                color: 'orange',
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${feature.color}/30 bg-gradient-to-br from-dynamic-${feature.color}/5 via-background to-background hover:border-dynamic-${feature.color}/50 hover:shadow-dynamic-${feature.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${feature.color}/10`
                    )}
                  >
                    <feature.icon
                      className={cn('h-6 w-6', `text-dynamic-${feature.color}`)}
                    />
                  </div>
                  <div className="mb-1 font-bold text-xl">{feature.title}</div>
                  <div className="mb-3 text-foreground/60 text-sm">
                    {feature.subtitle}
                  </div>
                  <p className="mb-4 text-foreground/70 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feature.features.map((feat, featIndex) => (
                      <Badge
                        key={featIndex}
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          `border-dynamic-${feature.color}/30 bg-dynamic-${feature.color}/10 text-dynamic-${feature.color}`
                        )}
                      >
                        {feat}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <Badge
              variant="secondary"
              className="mb-4 border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Live Demo
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              See It{' '}
              <span className="bg-gradient-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                In Action
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Experience the future of work with our interactive demos. These
              are real, production-ready features you can use today.
            </p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Task Management Demo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full overflow-hidden border-dynamic-green/30 bg-gradient-to-br from-dynamic-green/5 via-background to-background p-8">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-dynamic-green/10">
                    <CheckCircle2 className="h-7 w-7 text-dynamic-green" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-2xl">
                      Smart Task Management
                    </h3>
                    <p className="text-foreground/60 text-sm">
                      Hierarchical organization with AI insights
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Sample Task Cards */}
                  <div className="group rounded-lg border border-dynamic-green/20 bg-background/50 p-4 transition-all hover:border-dynamic-green/40 hover:shadow-md">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-5 w-5 items-center justify-center rounded border-2 border-dynamic-green/30 transition-colors group-hover:border-dynamic-green group-hover:bg-dynamic-green/10">
                          <Check className="h-3 w-3 text-dynamic-green opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            Review marketing proposal
                          </div>
                          <div className="flex items-center gap-2 text-foreground/50 text-xs">
                            <Clock className="h-3 w-3" />
                            Due tomorrow
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange text-xs"
                      >
                        High
                      </Badge>
                    </div>
                    <div className="ml-8 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                      >
                        <FileText className="mr-1 h-3 w-3" />2 files
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple text-xs"
                      >
                        <Users className="mr-1 h-3 w-3" />3 assignees
                      </Badge>
                    </div>
                  </div>

                  <div className="group rounded-lg border border-dynamic-blue/20 bg-background/50 p-4 transition-all hover:border-dynamic-blue/40 hover:shadow-md">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-5 w-5 items-center justify-center rounded border-2 border-dynamic-blue/30 transition-colors group-hover:border-dynamic-blue group-hover:bg-dynamic-blue/10">
                          <Check className="h-3 w-3 text-dynamic-blue opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            Implement calendar sync feature
                          </div>
                          <div className="flex items-center gap-2 text-foreground/50 text-xs">
                            <Clock className="h-3 w-3" />
                            Next week
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                      >
                        Medium
                      </Badge>
                    </div>
                    <div className="ml-8 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green text-xs"
                      >
                        <Code2 className="mr-1 h-3 w-3" />
                        Development
                      </Badge>
                    </div>
                  </div>

                  <div className="group rounded-lg border border-dynamic-purple/20 bg-background/50 p-4 transition-all hover:border-dynamic-purple/40 hover:shadow-md">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-5 w-5 items-center justify-center rounded border-2 border-dynamic-purple/30 transition-colors group-hover:border-dynamic-purple group-hover:bg-dynamic-purple/10">
                          <Check className="h-3 w-3 text-dynamic-purple opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            Plan team offsite event
                          </div>
                          <div className="flex items-center gap-2 text-foreground/50 text-xs">
                            <Calendar className="h-3 w-3" />
                            In 2 weeks
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow text-xs"
                      >
                        Low
                      </Badge>
                    </div>
                    <div className="ml-8 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink text-xs"
                      >
                        <Heart className="mr-1 h-3 w-3" />
                        Team building
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-dynamic-green/10 p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-dynamic-green" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        AI Insight
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        You have 3 high-priority tasks due this week. Consider
                        blocking 2 hours tomorrow morning for focused work.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <Target className="mr-2 h-4 w-4" />
                    Try Task Management
                  </Link>
                </Button>
              </Card>
            </motion.div>

            {/* Calendar Integration Demo */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full overflow-hidden border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/5 via-background to-background p-8">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-dynamic-blue/10">
                    <Calendar className="h-7 w-7 text-dynamic-blue" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-2xl">Smart Calendar</h3>
                    <p className="text-foreground/60 text-sm">
                      AI-powered scheduling and time blocking
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Today's Schedule */}
                  <div className="rounded-lg border border-dynamic-blue/20 bg-background/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold text-sm">
                        Today's Schedule
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                      >
                        6 events
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {/* Event 1 */}
                      <div className="flex gap-3 rounded-md bg-dynamic-purple/10 p-3 transition-colors hover:bg-dynamic-purple/20">
                        <div className="shrink-0 text-center">
                          <div className="font-semibold text-dynamic-purple text-xs">
                            9:00
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            AM
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-dynamic-purple border-l-2 pl-3">
                          <div className="font-medium text-sm">
                            Team Standup
                          </div>
                          <div className="flex items-center gap-2 text-foreground/60 text-xs">
                            <Users className="h-3 w-3" />5 participants
                          </div>
                        </div>
                      </div>

                      {/* Event 2 */}
                      <div className="flex gap-3 rounded-md bg-dynamic-green/10 p-3 transition-colors hover:bg-dynamic-green/20">
                        <div className="shrink-0 text-center">
                          <div className="font-semibold text-dynamic-green text-xs">
                            10:30
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            AM
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-dynamic-green border-l-2 pl-3">
                          <div className="font-medium text-sm">
                            Focus Time: Deep Work
                          </div>
                          <div className="flex items-center gap-2 text-foreground/60 text-xs">
                            <Zap className="h-3 w-3" />
                            AI-scheduled block
                          </div>
                        </div>
                      </div>

                      {/* Event 3 */}
                      <div className="flex gap-3 rounded-md bg-dynamic-orange/10 p-3 transition-colors hover:bg-dynamic-orange/20">
                        <div className="shrink-0 text-center">
                          <div className="font-semibold text-dynamic-orange text-xs">
                            2:00
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            PM
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-dynamic-orange border-l-2 pl-3">
                          <div className="font-medium text-sm">
                            Client Presentation
                          </div>
                          <div className="flex items-center gap-2 text-foreground/60 text-xs">
                            <Globe className="h-3 w-3" />
                            Video call
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Time Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-3 text-center">
                      <div className="mb-1 font-bold text-2xl text-dynamic-green">
                        3.5h
                      </div>
                      <div className="text-foreground/60 text-xs">
                        Focus Time
                      </div>
                    </div>
                    <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3 text-center">
                      <div className="mb-1 font-bold text-2xl text-dynamic-blue">
                        85%
                      </div>
                      <div className="text-foreground/60 text-xs">
                        Optimized
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-dynamic-blue/10 p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-dynamic-blue" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        Smart Suggestion
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        Your calendar is 15% more efficient than last week.
                        Consider adding another focus block on Friday.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <Calendar className="mr-2 h-4 w-4" />
                    Try Smart Calendar
                  </Link>
                </Button>
              </Card>
            </motion.div>

            {/* AI Chat Demo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full overflow-hidden border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/5 via-background to-background p-8">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-dynamic-purple/10">
                    <Bot className="h-7 w-7 text-dynamic-purple" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-2xl">
                      AI Assistant (Mira)
                    </h3>
                    <p className="text-foreground/60 text-sm">
                      Your proactive AI companion
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Chat Messages */}
                  <div className="space-y-3 rounded-lg border border-dynamic-purple/20 bg-background/50 p-4">
                    {/* User Message */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg bg-dynamic-blue/20 px-4 py-2">
                        <p className="text-sm">
                          What's on my agenda for tomorrow?
                        </p>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/20">
                        <Bot className="h-4 w-4 text-dynamic-purple" />
                      </div>
                      <div className="max-w-[80%] rounded-lg bg-dynamic-purple/10 px-4 py-2">
                        <p className="mb-2 text-sm leading-relaxed">
                          You have 4 meetings and 2 focus blocks scheduled:
                        </p>
                        <ul className="space-y-1 text-sm">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-dynamic-green" />
                            9:00 AM - Team sync (30 min)
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-dynamic-green" />
                            11:00 AM - Focus: Project Alpha (2h)
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-dynamic-green" />
                            2:00 PM - Client review (1h)
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* User Message */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg bg-dynamic-blue/20 px-4 py-2">
                        <p className="text-sm">
                          Can you reschedule the 2 PM meeting?
                        </p>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/20">
                        <Bot className="h-4 w-4 text-dynamic-purple" />
                      </div>
                      <div className="max-w-[80%] rounded-lg bg-dynamic-purple/10 px-4 py-2">
                        <p className="text-sm leading-relaxed">
                          I've found 3 available slots. The best option is
                          Friday at 3 PM based on everyone's calendar. Shall I
                          send the update?
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs transition-colors hover:bg-dynamic-blue/20"
                    >
                      Show my tasks
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green text-xs transition-colors hover:bg-dynamic-green/20"
                    >
                      Create reminder
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple text-xs transition-colors hover:bg-dynamic-purple/20"
                    >
                      Weekly summary
                    </Badge>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-dynamic-purple/10 p-4">
                  <div className="flex items-center gap-3">
                    <Brain className="h-5 w-5 text-dynamic-purple" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        Context-Aware
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        Mira understands your work patterns, preferences, and
                        goals to provide truly personalized assistance.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Chat with Mira
                  </Link>
                </Button>
              </Card>
            </motion.div>

            {/* Analytics Dashboard Demo */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full overflow-hidden border-dynamic-cyan/30 bg-gradient-to-br from-dynamic-cyan/5 via-background to-background p-8">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-dynamic-cyan/10">
                    <BarChart3 className="h-7 w-7 text-dynamic-cyan" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-2xl">
                      Analytics & Insights
                    </h3>
                    <p className="text-foreground/60 text-sm">
                      Track productivity and patterns
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-dynamic-green" />
                        <span className="font-semibold text-xs">Tasks</span>
                      </div>
                      <div className="font-bold text-2xl text-dynamic-green">
                        24
                      </div>
                      <div className="flex items-center gap-1 text-foreground/60 text-xs">
                        <ArrowRight className="h-3 w-3 rotate-[-45deg]" />
                        +15% this week
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-dynamic-blue" />
                        <span className="font-semibold text-xs">Focus</span>
                      </div>
                      <div className="font-bold text-2xl text-dynamic-blue">
                        18.5h
                      </div>
                      <div className="flex items-center gap-1 text-foreground/60 text-xs">
                        <ArrowRight className="h-3 w-3 rotate-[-45deg]" />
                        +3.2h vs last week
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Users className="h-4 w-4 text-dynamic-purple" />
                        <span className="font-semibold text-xs">Meetings</span>
                      </div>
                      <div className="font-bold text-2xl text-dynamic-purple">
                        12
                      </div>
                      <div className="flex items-center gap-1 text-foreground/60 text-xs">
                        <ArrowRight className="h-3 w-3 rotate-45" />
                        -8% this week
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Target className="h-4 w-4 text-dynamic-orange" />
                        <span className="font-semibold text-xs">Goals</span>
                      </div>
                      <div className="font-bold text-2xl text-dynamic-orange">
                        89%
                      </div>
                      <div className="text-foreground/60 text-xs">
                        Completion rate
                      </div>
                    </div>
                  </div>

                  {/* Productivity Score */}
                  <div className="rounded-lg border border-dynamic-cyan/20 bg-background/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold text-sm">
                        Productivity Score
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan"
                      >
                        Excellent
                      </Badge>
                    </div>
                    <div className="mb-2 h-3 overflow-hidden rounded-full bg-dynamic-cyan/20">
                      <div className="h-full w-[87%] rounded-full bg-gradient-to-r from-dynamic-cyan to-dynamic-blue" />
                    </div>
                    <div className="flex items-center justify-between text-foreground/60 text-xs">
                      <span>87/100</span>
                      <span>Top 10% of users</span>
                    </div>
                  </div>

                  {/* Weekly Breakdown */}
                  <div className="rounded-lg border border-dynamic-blue/20 bg-background/50 p-4">
                    <div className="mb-3 font-semibold text-sm">
                      This Week's Distribution
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-foreground/60 text-xs">
                          Deep Work
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full w-[65%] bg-dynamic-green" />
                        </div>
                        <div className="w-12 text-right text-foreground/60 text-xs">
                          65%
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-foreground/60 text-xs">
                          Meetings
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full w-[20%] bg-dynamic-purple" />
                        </div>
                        <div className="w-12 text-right text-foreground/60 text-xs">
                          20%
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-foreground/60 text-xs">
                          Admin
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full w-[15%] bg-dynamic-orange" />
                        </div>
                        <div className="w-12 text-right text-foreground/60 text-xs">
                          15%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-dynamic-cyan/10 p-4">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-dynamic-cyan" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        Performance
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        You're spending 65% more time on deep work compared to
                        last month. Keep it up!
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    View Full Dashboard
                  </Link>
                </Button>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI Core Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Powered by{' '}
              <span className="bg-gradient-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                AI Intelligence
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Meet Mira and the AI core that makes Tuturuuu truly intelligent
            </p>
          </motion.div>

          <Card className="overflow-hidden border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/5 via-background to-background p-8 md:p-12">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Mira Highlight */}
              <div className="lg:col-span-2">
                <div className="flex items-start gap-6">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-dynamic-pink/20 to-dynamic-purple/20">
                    <Bot className="h-10 w-10 text-dynamic-pink" />
                  </div>
                  <div>
                    <h3 className="mb-2 font-bold text-3xl">
                      Mira: Your AI Partner
                    </h3>
                    <p className="mb-4 text-foreground/70 text-lg leading-relaxed">
                      Mira is your proactive AI companion—the JARVIS we
                      envisioned. She plans, reasons, and acts on your behalf,
                      synchronizing calendars, goals, finances, and
                      communications to surface proactive recommendations
                      instead of passive reminders.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink"
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Proactive AI
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
                      >
                        <Brain className="mr-1.5 h-3.5 w-3.5" />
                        Context-Aware
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
                      >
                        <Zap className="mr-1.5 h-3.5 w-3.5" />
                        Always Learning
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Components Grid */}
              {[
                {
                  icon: Layers,
                  name: 'Aurora',
                  role: 'Nervous System',
                  description:
                    'Contextual engine that links related emails, tasks, files, and events',
                  color: 'blue',
                },
                {
                  icon: Database,
                  name: 'Rewise',
                  role: 'Collective Mind',
                  description:
                    'Aggregator of leading AI models (OpenAI, Gemini, Anthropic)',
                  color: 'purple',
                },
                {
                  icon: Cpu,
                  name: 'Nova',
                  role: 'Conscience & Forge',
                  description:
                    'Prompt-engineering platform that shapes how Mira reasons',
                  color: 'orange',
                },
                {
                  icon: Sparkles,
                  name: 'Crystal',
                  role: 'Bridge to Humanity',
                  description:
                    'Multi-modal interface for voice, video, and screen sharing',
                  color: 'cyan',
                },
              ].map((ai, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-xl border p-6 transition-all hover:shadow-md',
                    `border-dynamic-${ai.color}/30 bg-dynamic-${ai.color}/5 hover:border-dynamic-${ai.color}/50`
                  )}
                >
                  <div
                    className={cn(
                      'mb-3 flex h-12 w-12 items-center justify-center rounded-lg',
                      `bg-dynamic-${ai.color}/10`
                    )}
                  >
                    <ai.icon
                      className={cn('h-6 w-6', `text-dynamic-${ai.color}`)}
                    />
                  </div>
                  <h4 className="mb-1 font-bold text-lg">{ai.name}</h4>
                  <div className="mb-2 text-foreground/60 text-sm">
                    {ai.role}
                  </div>
                  <p className="text-foreground/70 text-sm leading-relaxed">
                    {ai.description}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="relative overflow-hidden border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              {/* Decorative Elements */}
              <div className="absolute inset-0 overflow-hidden opacity-10">
                <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-dynamic-purple blur-3xl" />
                <div className="absolute right-20 bottom-20 h-40 w-40 rounded-full bg-dynamic-pink blur-3xl" />
              </div>

              <div className="relative text-center">
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  Ready to Reclaim Your Time?
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  Join thousands of professionals who've eliminated digital
                  friction and regained focus. Start with our free plan—no
                  credit card required.
                </p>

                <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="/onboarding">
                      <Rocket className="mr-2 h-5 w-5" />
                      Get Started Free
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/about">
                      <Heart className="mr-2 h-5 w-5" />
                      Learn Our Story
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link
                      href="https://github.com/tutur3u/platform"
                      target="_blank"
                    >
                      <GitBranch className="mr-2 h-5 w-5" />
                      Star on GitHub
                    </Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/60 text-sm">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-dynamic-green" />
                    Open Source & Transparent
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-dynamic-blue" />
                    Enterprise-Grade Security
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-dynamic-purple" />
                    Self-Hostable
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
