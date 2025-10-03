'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  FileText,
  Folder,
  GitBranch,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Lightbulb,
  Lock,
  MessageSquare,
  Package,
  Rocket,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="relative mx-auto overflow-x-clip">
      {/* Dynamic Floating Orbs with Theme Colors */}
      <div className="-z-10 pointer-events-none fixed inset-0">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="-left-32 sm:-left-64 absolute top-0 h-96 w-96 rounded-full bg-gradient-to-br from-dynamic-purple/30 via-dynamic-pink/20 to-transparent blur-3xl sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="-right-32 sm:-right-64 absolute top-[30%] h-80 w-80 rounded-full bg-gradient-to-br from-dynamic-blue/30 via-dynamic-cyan/20 to-transparent blur-3xl sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="-bottom-32 -translate-x-1/2 sm:-bottom-64 absolute left-1/2 h-96 w-96 rounded-full bg-gradient-to-br from-dynamic-green/20 via-dynamic-emerald/15 to-transparent blur-3xl sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Enhanced Grid Pattern */}
      <div className="-z-10 pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:120px] opacity-50" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.05, 0.1, 0.05] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.08),transparent)]"
        />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-32 pb-20 sm:px-6 lg:px-8">
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
              The Age of Partners
            </Badge>

            <h1 className="mb-6 text-balance font-bold text-5xl tracking-tight sm:text-6xl md:text-7xl">
              Unlocking{' '}
              <span className="bg-gradient-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Human Potential
              </span>
              <br />
              Through Intelligent Technology
            </h1>

            <p className="mx-auto mb-12 max-w-3xl text-balance text-foreground/70 text-lg leading-relaxed sm:text-xl">
              We&apos;re building the world&apos;s first intelligent,
              open-source operating system for modern work and life. Our mission
              is to wage war on digital noise by creating a unified platform
              that automates administrative work and eliminates
              context-switching friction.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" className="group" asChild>
                <Link href="#vision">
                  Explore Our Vision
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link
                  href="https://github.com/tutur3u/platform"
                  target="_blank"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Open Source
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Vision & Mission Section */}
      <section id="vision" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Our{' '}
              <span className="bg-gradient-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                North Star
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              What drives us every day to push boundaries and innovate
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="group h-full border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/5 via-background to-background p-8 transition-all hover:border-dynamic-purple/50 hover:shadow-dynamic-purple/10 hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-purple/10">
                  <Target className="h-6 w-6 text-dynamic-purple" />
                </div>
                <h3 className="mb-3 font-bold text-2xl">Mission</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Wage war on digital noise by building an intelligent, unified,
                  and open platform that automates administrative work and
                  eliminates context-switching friction.
                </p>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="group h-full border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/5 via-background to-background p-8 transition-all hover:border-dynamic-blue/50 hover:shadow-dynamic-blue/10 hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue/10">
                  <Rocket className="h-6 w-6 text-dynamic-blue" />
                </div>
                <h3 className="mb-3 font-bold text-2xl">Vision</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Create a future where technology unlocks humanity&apos;s
                  potential—liberating our collective focus so we can solve the
                  world&apos;s most important challenges while making
                  world-class innovation accessible to everyone, everywhere.
                </p>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Core Beliefs Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Our{' '}
              <span className="bg-gradient-to-r from-dynamic-orange via-dynamic-red to-dynamic-pink bg-clip-text text-transparent">
                Core Beliefs
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              The fundamental principles that guide everything we build
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Zap,
                title: 'Focus is the New Superpower',
                description:
                  'In a world engineered for distraction, the ability to sustain deep work is the defining competitive advantage.',
                color: 'yellow',
              },
              {
                icon: Heart,
                title: 'Technology as Human Will',
                description:
                  'Technology must be an extension of human will, not a cage for our attention. We build software to reverse the trend.',
                color: 'red',
              },
              {
                icon: Shield,
                title: 'Radical Transparency',
                description:
                  'Foundational technology should never be a black box. Our open-source philosophy creates trust and accelerates innovation.',
                color: 'blue',
              },
              {
                icon: Target,
                title: 'Impact Over Activity',
                description:
                  'Productivity is not about doing more; it is about creating more value. We give people mental space for breakthroughs.',
                color: 'green',
              },
              {
                icon: Globe,
                title: 'Potential Has No Postcode',
                description:
                  'Brilliant ideas can emerge from any street, village, or classroom. Access to world-class tools should be universal.',
                color: 'purple',
              },
              {
                icon: Lightbulb,
                title: 'The Third Era',
                description:
                  'We are entering the Age of Partners, where AI acts as an intelligent partner to amplify human potential.',
                color: 'orange',
              },
            ].map((belief, index) => (
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
                    `border-dynamic-${belief.color}/30 bg-gradient-to-br from-dynamic-${belief.color}/5 via-background to-background hover:border-dynamic-${belief.color}/50 hover:shadow-dynamic-${belief.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-10 w-10 items-center justify-center rounded-lg',
                      `bg-dynamic-${belief.color}/10`
                    )}
                  >
                    <belief.icon
                      className={cn('h-5 w-5', `text-dynamic-${belief.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">{belief.title}</h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {belief.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem Section */}
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
              className="mb-4 border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
            >
              The Great Betrayal of Modern Work
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              The Costs of{' '}
              <span className="bg-gradient-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text text-transparent">
                Digital Friction
              </span>
            </h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: FileText,
                title: 'Financial Cost',
                stat: '21 hours/week',
                description:
                  'Lost to "work about work"—a trillion-dollar drag on global productivity',
                color: 'red',
              },
              {
                icon: Brain,
                title: 'Cognitive Cost',
                stat: '40% reduction',
                description:
                  'Context-switching slashes productive output and fuels burnout',
                color: 'orange',
              },
              {
                icon: Lightbulb,
                title: 'Innovation Cost',
                stat: 'Immeasurable',
                description:
                  'The next breakthrough suffocated by inboxes, meetings, and spreadsheets',
                color: 'yellow',
              },
            ].map((cost, index) => (
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
                    `border-dynamic-${cost.color}/30 bg-gradient-to-br from-dynamic-${cost.color}/5 via-background to-background hover:border-dynamic-${cost.color}/50 hover:shadow-dynamic-${cost.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl',
                      `bg-dynamic-${cost.color}/10`
                    )}
                  >
                    <cost.icon
                      className={cn('h-7 w-7', `text-dynamic-${cost.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-bold text-xl">{cost.title}</h3>
                  <div
                    className={cn(
                      'mb-3 font-bold text-3xl',
                      `text-dynamic-${cost.color}`
                    )}
                  >
                    {cost.stat}
                  </div>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {cost.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tuturuuu Ecosystem Section */}
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
              <span className="bg-gradient-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                Tuturuuu Ecosystem
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              A cohesive suite of applications that behave like a single
              organism
            </p>
          </motion.div>

          <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Calendar,
                name: 'TuPlan',
                description: 'AI-powered auto-scheduling',
                color: 'blue',
              },
              {
                icon: CheckCircle2,
                name: 'TuDo',
                description: 'Smart task management',
                color: 'green',
              },
              {
                icon: Users,
                name: 'TuMeet',
                description: 'Intelligent meetings',
                color: 'purple',
              },
              {
                icon: MessageSquare,
                name: 'TuChat',
                description: 'Unified communications',
                color: 'cyan',
              },
            ].map((app, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group p-6 text-center transition-all hover:shadow-lg',
                    `border-dynamic-${app.color}/30 bg-gradient-to-br from-dynamic-${app.color}/5 via-background to-background hover:border-dynamic-${app.color}/50 hover:shadow-dynamic-${app.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                      `bg-dynamic-${app.color}/10`
                    )}
                  >
                    <app.icon
                      className={cn('h-6 w-6', `text-dynamic-${app.color}`)}
                    />
                  </div>
                  <h3 className="mb-1 font-bold text-lg">{app.name}</h3>
                  <p className="text-foreground/60 text-sm">
                    {app.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <Card className="border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/5 via-background to-background p-8">
              <div className="mb-6 text-center">
                <h3 className="mb-2 font-bold text-2xl">AI Core</h3>
                <p className="text-foreground/60">
                  The Architecture of Intelligence
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    icon: Bot,
                    name: 'Mira',
                    role: 'Soul & Voice',
                    color: 'pink',
                  },
                  {
                    icon: Layers,
                    name: 'Aurora',
                    role: 'Nervous System',
                    color: 'blue',
                  },
                  {
                    icon: Database,
                    name: 'Rewise',
                    role: 'Collective Mind',
                    color: 'purple',
                  },
                  {
                    icon: Cpu,
                    name: 'Nova',
                    role: 'Conscience & Forge',
                    color: 'orange',
                  },
                  {
                    icon: Sparkles,
                    name: 'Crystal',
                    role: 'Bridge to Humanity',
                    color: 'cyan',
                  },
                ].map((ai, index) => (
                  <div
                    key={index}
                    className={cn(
                      'rounded-lg border p-4 text-center transition-all hover:shadow-md',
                      `border-dynamic-${ai.color}/30 bg-dynamic-${ai.color}/5 hover:border-dynamic-${ai.color}/50`
                    )}
                  >
                    <div
                      className={cn(
                        'mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg',
                        `bg-dynamic-${ai.color}/10`
                      )}
                    >
                      <ai.icon
                        className={cn('h-5 w-5', `text-dynamic-${ai.color}`)}
                      />
                    </div>
                    <h4 className="mb-1 font-semibold text-sm">{ai.name}</h4>
                    <p className="text-foreground/50 text-xs">{ai.role}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Technology Stack Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Built with{' '}
              <span className="bg-gradient-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Cutting-Edge Tech
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              We leverage the latest technologies to build a platform that is
              fast, reliable, and scalable
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                category: 'Frontend',
                icon: Code2,
                technologies: [
                  'Next.js 15',
                  'React',
                  'TypeScript',
                  'Tailwind CSS',
                ],
                color: 'cyan',
              },
              {
                category: 'Backend',
                icon: Server,
                technologies: [
                  'Supabase',
                  'PostgreSQL',
                  'tRPC',
                  'Vercel AI SDK',
                ],
                color: 'green',
              },
              {
                category: 'Infrastructure',
                icon: Package,
                technologies: ['Turborepo', 'Bun', 'Docker', 'Vercel'],
                color: 'blue',
              },
              {
                category: 'AI & Analytics',
                icon: Brain,
                technologies: ['OpenAI', 'Anthropic', 'Gemini', 'Vertex AI'],
                color: 'purple',
              },
            ].map((stack, index) => (
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
                    `border-dynamic-${stack.color}/30 bg-gradient-to-br from-dynamic-${stack.color}/5 via-background to-background hover:border-dynamic-${stack.color}/50 hover:shadow-dynamic-${stack.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                      `bg-dynamic-${stack.color}/10`
                    )}
                  >
                    <stack.icon
                      className={cn('h-6 w-6', `text-dynamic-${stack.color}`)}
                    />
                  </div>
                  <h3 className="mb-3 font-bold text-lg">{stack.category}</h3>
                  <ul className="space-y-1.5">
                    {stack.technologies.map((tech, techIndex) => (
                      <li
                        key={techIndex}
                        className="flex items-center gap-2 text-foreground/60 text-sm"
                      >
                        <div
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            `bg-dynamic-${stack.color}`
                          )}
                        />
                        {tech}
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Features Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              More Than Just{' '}
              <span className="bg-gradient-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                Productivity
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              A comprehensive suite of tools to manage every aspect of your work
              and life
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Wallet,
                title: 'Finance Management',
                description:
                  'Track expenses, manage budgets, and gain insights into your financial health with AI-powered analytics.',
                features: [
                  'Expense tracking',
                  'Budget planning',
                  'Financial insights',
                ],
                color: 'green',
              },
              {
                icon: Folder,
                title: 'Inventory System',
                description:
                  'Manage products, track stock levels, and optimize your supply chain with intelligent automation.',
                features: ['Stock management', 'Auto-reordering', 'Analytics'],
                color: 'orange',
              },
              {
                icon: GraduationCap,
                title: 'Learning Platform',
                description:
                  'Access educational content, practice with AI challenges, and level up your skills through Nova.',
                features: ['AI challenges', 'Skill tracking', 'Leaderboards'],
                color: 'purple',
              },
              {
                icon: BarChart3,
                title: 'Analytics Dashboard',
                description:
                  'Visualize your productivity patterns, track goals, and make data-driven decisions.',
                features: ['Real-time metrics', 'Custom reports', 'Insights'],
                color: 'blue',
              },
              {
                icon: Lock,
                title: 'Enterprise Security',
                description:
                  'Bank-grade encryption, granular permissions, and comprehensive audit logs keep your data safe.',
                features: ['Row-level security', 'RBAC', 'Audit trails'],
                color: 'red',
              },
              {
                icon: GitBranch,
                title: 'Open Source',
                description:
                  'Full transparency with public source code, community contributions, and self-hosting options.',
                features: [
                  'Public GitHub',
                  'Community-driven',
                  'Self-hostable',
                ],
                color: 'cyan',
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
                  <h3 className="mb-2 font-bold text-xl">{feature.title}</h3>
                  <p className="mb-4 text-foreground/60 text-sm leading-relaxed">
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

      {/* Innovation Timeline Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Our{' '}
              <span className="bg-gradient-to-r from-dynamic-yellow via-dynamic-orange to-dynamic-red bg-clip-text text-transparent">
                Innovation Journey
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              From ambitious vision to transformative reality
            </p>
          </motion.div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute top-0 bottom-0 left-8 w-0.5 bg-gradient-to-b from-dynamic-purple via-dynamic-blue to-dynamic-green md:left-1/2" />

            <div className="space-y-12">
              {[
                {
                  phase: 'Foundation',
                  period: '2024 - Early Days',
                  title: 'The Spark',
                  description:
                    'Recognized the Great Betrayal of Modern Work and envisioned a better future where AI serves humanity.',
                  icon: Lightbulb,
                  color: 'yellow',
                  achievements: [
                    'Platform architecture',
                    'Core team assembled',
                  ],
                },
                {
                  phase: 'Building',
                  period: '2024 - Present',
                  title: 'Rapid Development',
                  description:
                    'Built the foundation with 377+ database migrations, comprehensive authentication, and AI integration.',
                  icon: Rocket,
                  color: 'blue',
                  achievements: [
                    'TuDo task management',
                    'Calendar sync',
                    'Finance tracking',
                    'Nova platform',
                  ],
                },
                {
                  phase: 'Launch',
                  period: 'April 2, 2025',
                  title: 'Official Incorporation',
                  description:
                    'TUTURUUU JSC officially founded, marking our commitment to building the intelligent OS for modern work.',
                  icon: Building2,
                  color: 'purple',
                  achievements: [
                    'Legal entity established',
                    'Open source release',
                  ],
                },
                {
                  phase: 'Evolution',
                  period: '2025 - Future',
                  title: 'The Age of Partners',
                  description:
                    "Expanding Mira's capabilities, building Aurora's context graph, and making the impossible possible for everyone.",
                  icon: Sparkles,
                  color: 'pink',
                  achievements: [
                    'Multi-agent intelligence',
                    'Global accessibility',
                    'Continuous learning',
                  ],
                },
              ].map((milestone, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                  className={cn(
                    'relative grid gap-8 md:grid-cols-2',
                    index % 2 === 0 ? 'md:text-right' : 'md:flex-row-reverse'
                  )}
                >
                  {/* Content */}
                  <div
                    className={
                      index % 2 === 0 ? 'md:pr-16' : 'md:col-start-2 md:pl-16'
                    }
                  >
                    <Card
                      className={cn(
                        'p-6 transition-all hover:shadow-lg',
                        `border-dynamic-${milestone.color}/30 bg-gradient-to-br from-dynamic-${milestone.color}/5 via-background to-background hover:border-dynamic-${milestone.color}/50 hover:shadow-dynamic-${milestone.color}/10`
                      )}
                    >
                      <Badge
                        variant="secondary"
                        className={cn(
                          'mb-3',
                          `border-dynamic-${milestone.color}/30 bg-dynamic-${milestone.color}/10 text-dynamic-${milestone.color}`
                        )}
                      >
                        {milestone.phase}
                      </Badge>
                      <h3 className="mb-1 font-bold text-2xl">
                        {milestone.title}
                      </h3>
                      <p className="mb-3 text-foreground/50 text-sm">
                        {milestone.period}
                      </p>
                      <p className="mb-4 text-foreground/70 leading-relaxed">
                        {milestone.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {milestone.achievements.map((achievement, achIndex) => (
                          <div
                            key={achIndex}
                            className="flex items-center gap-1.5 text-foreground/60 text-sm"
                          >
                            <CheckCircle2
                              className={cn(
                                'h-4 w-4',
                                `text-dynamic-${milestone.color}`
                              )}
                            />
                            {achievement}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  {/* Timeline node */}
                  <div className="md:-translate-x-1/2 absolute top-6 left-8 md:left-1/2">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-background shadow-lg">
                      <div
                        className={cn(
                          'absolute inset-1 rounded-full',
                          `bg-dynamic-${milestone.color}/20`
                        )}
                      />
                      <milestone.icon
                        className={cn(
                          'relative z-10 h-8 w-8',
                          `text-dynamic-${milestone.color}`
                        )}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Community & Culture Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Building a{' '}
              <span className="bg-gradient-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Global Community
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Join thousands of builders, dreamers, and innovators shaping the
              future
            </p>
          </motion.div>

          <div className="mb-12 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: 'Open Source Community',
                value: '10K+',
                description:
                  'Contributors and users building together on GitHub',
                color: 'blue',
              },
              {
                icon: GitBranch,
                title: 'Code Contributions',
                value: '10,000+',
                description: 'Git commits from 30+ contributors since 2022',
                color: 'green',
              },
              {
                icon: Trophy,
                title: 'Innovation Milestones',
                value: '50+',
                description: 'Features and integrations shipped',
                color: 'yellow',
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'p-8 text-center transition-all hover:shadow-lg',
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
                    {stat.value}
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">{stat.title}</h3>
                  <p className="text-foreground/60 text-sm">
                    {stat.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="overflow-hidden border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 md:p-12">
            <div className="mb-8 text-center">
              <h3 className="mb-3 font-bold text-3xl">Our Culture</h3>
              <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
                Values that define how we work and innovate together
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'Builders, Not Employees',
                  description:
                    'Each teammate acts like a founder within their domain',
                  icon: Settings,
                },
                {
                  title: 'Pragmatic Optimism',
                  description: 'Bold ambition paired with rigorous execution',
                  icon: TrendingUp,
                },
                {
                  title: 'Relentless Ownership',
                  description:
                    'Decisions come with accountability for outcomes',
                  icon: Shield,
                },
                {
                  title: 'Transparency by Default',
                  description:
                    'Internal operations mirror our open-source ethos',
                  icon: Search,
                },
                {
                  title: 'Vietnam-Rooted',
                  description: 'Global ambitions, Southeast Asian excellence',
                  icon: Globe,
                },
                {
                  title: 'Innovation First',
                  description: 'Technology can originate from anywhere',
                  icon: Rocket,
                },
              ].map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-lg border border-dynamic-purple/20 bg-background/50 p-6 backdrop-blur-sm transition-all hover:border-dynamic-purple/40 hover:shadow-md"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-purple/10">
                    <value.icon className="h-5 w-5 text-dynamic-purple" />
                  </div>
                  <h4 className="mb-2 font-semibold">{value.title}</h4>
                  <p className="text-foreground/60 text-sm">
                    {value.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* Company Info Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/5 via-background to-background p-8 md:p-12">
              <div className="mb-8 flex items-start gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-dynamic-blue/10">
                  <Building2 className="h-8 w-8 text-dynamic-blue" />
                </div>
                <div>
                  <h2 className="mb-2 font-bold text-3xl">
                    TUTURUUU JOINT STOCK COMPANY
                  </h2>
                  <p className="text-foreground/60">
                    Building the intelligent OS for modern work
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 font-semibold text-dynamic-blue text-sm uppercase tracking-wide">
                    Company Details
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-foreground/50">
                        Tax Code
                      </dt>
                      <dd className="text-foreground">0318898402</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/50">
                        Founded
                      </dt>
                      <dd className="text-foreground">April 2, 2025</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/50">
                        Founder & CEO
                      </dt>
                      <dd className="text-foreground">Võ Hoàng Phúc</dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="mb-3 font-semibold text-dynamic-blue text-sm uppercase tracking-wide">
                    Location
                  </h3>
                  <p className="text-foreground/70 text-sm leading-relaxed">
                    Tầng 14, Tòa Nhà HM Town
                    <br />
                    412 Nguyễn Thị Minh Khai
                    <br />
                    Phường 05, Quận 3
                    <br />
                    Thành phố Hồ Chí Minh, Việt Nam
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 border-dynamic-blue/20 border-t pt-8">
                <Button variant="outline" size="sm" asChild>
                  <Link href="https://tuturuuu.com" target="_blank">
                    <Globe className="mr-2 h-4 w-4" />
                    Website
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href="https://github.com/tutur3u/platform"
                    target="_blank"
                  >
                    <Layers className="mr-2 h-4 w-4" />
                    GitHub
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="mailto:contact@tuturuuu.com">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Contact
                  </Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <Card className="overflow-hidden border-dynamic-purple/30 bg-gradient-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                Join Us in Building the Future
              </h2>
              <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg">
                We're assembling a team of builders who believe technology
                should unlock human potential. If you share our vision, let's
                create something extraordinary together.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button size="lg" asChild>
                  <Link
                    href="https://github.com/tutur3u/platform"
                    target="_blank"
                  >
                    <Layers className="mr-2 h-5 w-5" />
                    Contribute on GitHub
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="mailto:contact@tuturuuu.com">Get in Touch</Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
