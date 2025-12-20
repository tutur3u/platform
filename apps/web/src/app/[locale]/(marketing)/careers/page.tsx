'use client';

import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  GithubIcon,
  Globe,
  GraduationCap,
  Heart,
  Laptop,
  Layers,
  Lightbulb,
  Mail,
  MapPin,
  MessageSquare,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function CareersPage() {
  const values = [
    {
      icon: Zap,
      title: 'Focus is the New Superpower',
      description:
        'In a world engineered for distraction, we build technology that protects and amplifies deep work.',
      color: 'yellow',
    },
    {
      icon: Heart,
      title: 'Technology Serves Humanity',
      description:
        'We create software as an extension of human will, not a cage for attention.',
      color: 'red',
    },
    {
      icon: Shield,
      title: 'Radical Transparency',
      description:
        'Open-source at our core. Foundational technology should never be a black box.',
      color: 'blue',
    },
    {
      icon: Target,
      title: 'Impact Over Activity',
      description:
        'Productivity is about creating value, not just doing more. We free minds for breakthroughs.',
      color: 'green',
    },
    {
      icon: Globe,
      title: 'Potential Has No Postcode',
      description:
        'World-class tools should be accessible from any street, village, or classroom.',
      color: 'purple',
    },
    {
      icon: Lightbulb,
      title: 'Building the Third Era',
      description:
        'Moving from passive tools and attention platforms to proactive AI partners.',
      color: 'orange',
    },
  ];

  const culture = [
    {
      icon: Building2,
      title: 'Builders, Not Employees',
      description: 'Each teammate acts like a founder within their domain.',
      color: 'blue',
    },
    {
      icon: TrendingUp,
      title: 'Pragmatic Optimism',
      description: 'We pair bold ambition with rigorous execution.',
      color: 'green',
    },
    {
      icon: Shield,
      title: 'Relentless Ownership',
      description: 'Decisions come with accountability for outcomes.',
      color: 'purple',
    },
    {
      icon: Sparkles,
      title: 'Transparency by Default',
      description: 'Internal operations mirror our open-source ethos.',
      color: 'cyan',
    },
    {
      icon: MapPin,
      title: 'Vietnam-Rooted, Globally Ambitious',
      description: 'Building from Southeast Asia with world-class conviction.',
      color: 'pink',
    },
    {
      icon: Rocket,
      title: 'Innovation DNA',
      description: 'We see possibilities where others see limitations.',
      color: 'orange',
    },
  ];

  const roles = [
    {
      icon: Code2,
      area: 'Engineering',
      description:
        'Build the intelligent OS for modern work. Shape Aurora, Mira, and our entire application suite.',
      positions: [
        'Full-Stack Engineers',
        'AI/ML Engineers',
        'Frontend Engineers',
        'Backend Engineers',
        'DevOps Engineers',
      ],
      color: 'blue',
    },
    {
      icon: Brain,
      area: 'AI & Research',
      description:
        'Pioneer the Third Era. Work on Mira (our JARVIS), Aurora context graphs, and Nova alignment.',
      positions: [
        'AI Researchers',
        'Prompt Engineers',
        'ML Platform Engineers',
        'NLP Specialists',
      ],
      color: 'purple',
    },
    {
      icon: Sparkles,
      area: 'Product & Design',
      description:
        'Craft experiences that eliminate friction. Design the future of human-AI collaboration.',
      positions: [
        'Product Managers',
        'UX/UI Designers',
        'Design Engineers',
        'User Researchers',
      ],
      color: 'pink',
    },
    {
      icon: Users,
      area: 'Growth & Operations',
      description:
        'Scale our impact. Build the community flywheel and operational excellence.',
      positions: [
        'Growth Marketers',
        'Community Managers',
        'Operations Specialists',
        'Business Development',
      ],
      color: 'green',
    },
  ];

  const benefits = [
    {
      icon: Laptop,
      title: 'Flexible Work',
      description:
        'Work when you are most productive. Remote-friendly with Vietnam hub.',
    },
    {
      icon: GraduationCap,
      title: 'Learning Budget',
      description:
        'Industry-leading resources for courses, conferences, and growth.',
    },
    {
      icon: Heart,
      title: 'Premium Benefits',
      description:
        'Top-tier health coverage, wellness programs, and comprehensive package.',
    },
    {
      icon: Users,
      title: 'Team Events',
      description:
        'Regular activities to build connections, with plans for global expansion.',
    },
    {
      icon: Rocket,
      title: 'Equity & Impact',
      description:
        'Share in our success with meaningful equity and shape technology history.',
    },
    {
      icon: Globe,
      title: 'Global Opportunities',
      description: 'Work with world-class talent from Vietnam to the world.',
    },
  ];

  const techStack = [
    {
      category: 'Frontend',
      icon: Code2,
      technologies: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
      color: 'cyan',
    },
    {
      category: 'Backend',
      icon: Database,
      technologies: ['Supabase', 'PostgreSQL', 'tRPC', 'Vercel AI SDK'],
      color: 'green',
    },
    {
      category: 'AI/ML',
      icon: Brain,
      technologies: ['OpenAI', 'Anthropic', 'Google Gemini', 'LangChain'],
      color: 'purple',
    },
    {
      category: 'Infrastructure',
      icon: Layers,
      technologies: ['Vercel', 'Turborepo', 'Bun', 'Docker'],
      color: 'blue',
    },
  ];

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Dynamic Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
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
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
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
          className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
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
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple transition-all hover:scale-105 hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Building the Third Era of Technology
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              Build the{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Future
              </span>
              <br />
              of Human Potential
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              Join us in creating{' '}
              <strong className="text-foreground">Mira</strong>—our JARVIS for
              modern life. We're not just building productivity tools; we're
              pioneering intelligent AI partners that amplify human creativity
              and eliminate digital friction.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="mb-12 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4"
            >
              <Button
                size="lg"
                className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
                asChild
              >
                <Link href="#roles">
                  View Open Roles
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full transition-all hover:scale-105 sm:w-auto"
                asChild
              >
                <Link href="mailto:contact@tuturuuu.com">
                  <Mail className="mr-2 h-5 w-5" />
                  Get in Touch
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full transition-all hover:scale-105 sm:w-auto"
                asChild
              >
                <Link
                  href="https://github.com/tutur3u/platform"
                  target="_blank"
                >
                  <GithubIcon className="mr-2 h-5 w-5" />
                  View Our Work
                </Link>
              </Button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="flex flex-col flex-wrap items-center justify-center gap-4 text-foreground/60 text-sm sm:flex-row sm:gap-6"
            >
              <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                <Shield className="h-4 w-4 text-dynamic-green" />
                100% Open Source
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                <MapPin className="h-4 w-4 text-dynamic-green" />
                Vietnam-Based, Global Vision
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                <Star className="h-4 w-4 text-dynamic-green" />
                Building JARVIS for Everyone
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 md:p-12">
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                    <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                      Our Mission
                    </span>
                  </h2>
                  <p className="mb-6 text-foreground/70 text-lg leading-relaxed">
                    Wage war on digital noise by building an intelligent,
                    unified, and open platform that automates administrative
                    work and eliminates context-switching friction.
                  </p>
                  <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                    <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                      Our Vision
                    </span>
                  </h2>
                  <p className="text-foreground/70 text-lg leading-relaxed">
                    Create a future where technology unlocks humanity's
                    potential—liberating our collective focus so we can solve
                    the world's most important challenges.
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-dynamic-purple/30 bg-dynamic-purple/5 p-4 text-center">
                      <Rocket className="mx-auto mb-2 h-8 w-8 text-dynamic-purple" />
                      <div className="font-bold text-2xl text-dynamic-purple">
                        7+
                      </div>
                      <div className="text-foreground/60 text-xs">Products</div>
                    </Card>
                    <Card className="border-dynamic-blue/30 bg-dynamic-blue/5 p-4 text-center">
                      <Bot className="mx-auto mb-2 h-8 w-8 text-dynamic-blue" />
                      <div className="font-bold text-2xl text-dynamic-blue">
                        5
                      </div>
                      <div className="text-foreground/60 text-xs">
                        AI Agents
                      </div>
                    </Card>
                    <Card className="border-dynamic-green/30 bg-dynamic-green/5 p-4 text-center">
                      <Globe className="mx-auto mb-2 h-8 w-8 text-dynamic-green" />
                      <div className="font-bold text-2xl text-dynamic-green">
                        Global
                      </div>
                      <div className="text-foreground/60 text-xs">Ambition</div>
                    </Card>
                    <Card className="border-dynamic-orange/30 bg-dynamic-orange/5 p-4 text-center">
                      <Shield className="mx-auto mb-2 h-8 w-8 text-dynamic-orange" />
                      <div className="font-bold text-2xl text-dynamic-orange">
                        100%
                      </div>
                      <div className="text-foreground/60 text-xs">
                        Open Source
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Core Values */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Core{' '}
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Beliefs
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              These principles guide everything we build and how we work
              together
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${value.color}/30 bg-linear-to-br from-dynamic-${value.color}/5 via-background to-background hover:border-dynamic-${value.color}/50 hover:shadow-dynamic-${value.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${value.color}/10`
                    )}
                  >
                    <value.icon
                      className={cn('h-6 w-6', `text-dynamic-${value.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">{value.title}</h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {value.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What We're Building */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <Badge
              variant="secondary"
              className="mb-4 border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan"
            >
              <Bot className="mr-1.5 h-3.5 w-3.5" />
              The AI Ecosystem
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Building{' '}
              <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                Mira & Aurora
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Our AI-powered ecosystem that transforms how humans work and
              create
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: 'Mira',
                subtitle: 'Your JARVIS Companion',
                description:
                  'Proactive AI assistant that plans, reasons, and acts on your behalf—the life operating system we envisioned.',
                icon: Bot,
                color: 'pink',
                features: [
                  'Natural Conversations',
                  'Proactive Planning',
                  'Cross-App Integration',
                ],
              },
              {
                name: 'Aurora',
                subtitle: 'Context Graph Engine',
                description:
                  'The nervous system linking emails, tasks, files, and events into a unified knowledge graph.',
                icon: Cpu,
                color: 'blue',
                features: [
                  'Contextual Intelligence',
                  'Smart Connections',
                  'Data Moat',
                ],
              },
              {
                name: 'Nova',
                subtitle: 'Alignment Platform',
                description:
                  'Our prompt-engineering forge ensuring Mira reasons safely and effectively.',
                icon: Sparkles,
                color: 'orange',
                features: [
                  'Prompt Engineering',
                  'Safety Guardrails',
                  'Continuous Learning',
                ],
              },
              {
                name: 'Rewise',
                subtitle: 'Knowledge Federation',
                description:
                  'Aggregates leading AI models (OpenAI, Gemini, Anthropic) for best-in-class intelligence.',
                icon: Database,
                color: 'purple',
                features: [
                  'Multi-Model Access',
                  'Knowledge Synthesis',
                  'Smart Routing',
                ],
              },
              {
                name: 'Crystal',
                subtitle: 'Multi-Modal Interface',
                description:
                  'Real-time collaboration via voice, video, and screen sharing—Mira embodied.',
                icon: Layers,
                color: 'cyan',
                features: [
                  'Voice & Video',
                  'Screen Sharing',
                  'Real-Time Collab',
                ],
              },
              {
                name: 'TuApps Suite',
                subtitle: '7 Integrated Products',
                description:
                  'TuPlan, TuDo, TuMeet, TuMail, TuChat, TuDrive, TuTrack—unified by Mira.',
                icon: Layers,
                color: 'green',
                features: [
                  'Smart Calendar',
                  'Task Management',
                  'Unified Inbox',
                ],
              },
            ].map((product, index) => (
              <motion.div
                key={product.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${product.color}/30 bg-linear-to-br from-dynamic-${product.color}/5 via-background to-background hover:border-dynamic-${product.color}/50 hover:shadow-dynamic-${product.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                      `bg-dynamic-${product.color}/10`
                    )}
                  >
                    <product.icon
                      className={cn('h-6 w-6', `text-dynamic-${product.color}`)}
                    />
                  </div>
                  <h3 className="mb-1 font-bold text-xl">{product.name}</h3>
                  <div className="mb-3 text-foreground/60 text-sm">
                    {product.subtitle}
                  </div>
                  <p className="mb-4 text-foreground/70 text-sm leading-relaxed">
                    {product.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.features.map((feature) => (
                      <Badge
                        key={feature}
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          `border-dynamic-${product.color}/30 bg-dynamic-${product.color}/10 text-dynamic-${product.color}`
                        )}
                      >
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Roles */}
      <section
        id="roles"
        className="relative scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Open{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Opportunities
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Join world-class builders shaping the future of human-AI
              collaboration
            </p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2">
            {roles.map((role, index) => (
              <motion.div
                key={role.area}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-8 transition-all hover:shadow-lg',
                    `border-dynamic-${role.color}/30 bg-linear-to-br from-dynamic-${role.color}/5 via-background to-background hover:border-dynamic-${role.color}/50 hover:shadow-dynamic-${role.color}/10`
                  )}
                >
                  <div className="mb-6 flex items-start gap-4">
                    <div
                      className={cn(
                        'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                        `bg-dynamic-${role.color}/10`
                      )}
                    >
                      <role.icon
                        className={cn('h-7 w-7', `text-dynamic-${role.color}`)}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-2 font-bold text-2xl">{role.area}</h3>
                      <p className="text-foreground/70 leading-relaxed">
                        {role.description}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 space-y-2">
                    {role.positions.map((position) => (
                      <div
                        key={position}
                        className="flex items-center gap-2 text-sm"
                      >
                        <CheckCircle2
                          className={cn(
                            'h-4 w-4',
                            `text-dynamic-${role.color}`
                          )}
                        />
                        <span>{position}</span>
                      </div>
                    ))}
                  </div>

                  <Button className="w-full" variant="outline" asChild>
                    <Link href="mailto:contact@tuturuuu.com">
                      <Mail className="mr-2 h-4 w-4" />
                      Apply Now
                    </Link>
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 text-center"
          >
            <Card className="border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 text-dynamic-purple" />
              <h3 className="mb-3 font-bold text-2xl">Don't See Your Role?</h3>
              <p className="mx-auto mb-6 max-w-2xl text-foreground/70 leading-relaxed">
                We're always looking for exceptional talent. If you're
                passionate about building the future of human potential, reach
                out with your story.
              </p>
              <Button size="lg" asChild>
                <Link href="mailto:contact@tuturuuu.com">
                  <Mail className="mr-2 h-5 w-5" />
                  Get in Touch
                </Link>
              </Button>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Culture & Values */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Our{' '}
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                Culture
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              How we work, collaborate, and grow together
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {culture.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${item.color}/30 bg-linear-to-br from-dynamic-${item.color}/5 via-background to-background hover:border-dynamic-${item.color}/50 hover:shadow-dynamic-${item.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${item.color}/10`
                    )}
                  >
                    <item.icon
                      className={cn('h-6 w-6', `text-dynamic-${item.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">{item.title}</h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits & Perks */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Benefits &{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-emerald to-dynamic-cyan bg-clip-text text-transparent">
                Perks
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              We invest in our team's growth, health, and happiness
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="group h-full border-foreground/10 bg-foreground/5 p-6 transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-lg">
                  <benefit.icon className="mb-4 h-8 w-8 text-primary transition-transform group-hover:scale-110" />
                  <h3 className="mb-2 font-semibold text-lg">
                    {benefit.title}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {benefit.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <Badge
              variant="secondary"
              className="mb-4 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
            >
              <Code2 className="mr-1.5 h-3.5 w-3.5" />
              Modern Stack
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              World-Class{' '}
              <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                Technology
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Work with cutting-edge tools and contribute to open-source
              innovation
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {techStack.map((stack, index) => (
              <motion.div
                key={stack.category}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${stack.color}/30 bg-linear-to-br from-dynamic-${stack.color}/5 via-background to-background hover:border-dynamic-${stack.color}/50 hover:shadow-dynamic-${stack.color}/10`
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
                    {stack.technologies.map((tech) => (
                      <li
                        key={tech}
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

      {/* CTA Section */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              {/* Decorative Elements */}
              <div className="absolute inset-0 overflow-hidden opacity-10">
                <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-dynamic-purple blur-3xl" />
                <div className="absolute right-20 bottom-20 h-40 w-40 rounded-full bg-dynamic-pink blur-3xl" />
              </div>

              <div className="relative text-center">
                <Rocket className="mx-auto mb-6 h-16 w-16 text-dynamic-purple" />
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  Ready to Build the Future?
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  Join us in creating technology that unlocks human potential.
                  Whether you're building Mira, shaping Aurora, or crafting
                  experiences—let's change the world together.
                </p>

                <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="mailto:contact@tuturuuu.com">
                      <Mail className="mr-2 h-5 w-5" />
                      Apply Now
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
                      <GithubIcon className="mr-2 h-5 w-5" />
                      View GitHub
                    </Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/60 text-sm">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-dynamic-green" />
                    Open Source First
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-dynamic-blue" />
                    Ho Chi Minh City
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-dynamic-purple" />
                    Global Impact
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
