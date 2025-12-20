'use client';

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
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function AboutPage() {
  const t = useTranslations('about');

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Dynamic Floating Orbs with Theme Colors */}
      <div className="pointer-events-none fixed inset-0 -z-10">
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
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/30 via-dynamic-pink/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
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
          className="absolute top-[30%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/30 via-dynamic-cyan/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
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
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/20 via-dynamic-emerald/15 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Enhanced Grid Pattern */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40">
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
                {t('hero.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
            >
              {t('hero.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                {t('hero.title.highlight')}
              </span>
              <br />
              {t('hero.title.part2')}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-12 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl"
            >
              {t('hero.description')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4"
            >
              <Button
                size="lg"
                className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
                asChild
              >
                <Link href="#vision">
                  {t('hero.cta.vision')}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
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
                  <Globe className="mr-2 h-4 w-4" />
                  {t('hero.cta.openSource')}
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Vision & Mission Section */}
      <section id="vision" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('vision.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                {t('vision.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('vision.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="group h-full border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8 transition-all hover:border-dynamic-purple/50 hover:shadow-dynamic-purple/10 hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-purple/10">
                  <Target className="h-6 w-6 text-dynamic-purple" />
                </div>
                <h3 className="mb-3 font-bold text-2xl">
                  {t('vision.mission.title')}
                </h3>
                <p className="text-foreground/70 leading-relaxed">
                  {t('vision.mission.description')}
                </p>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="group h-full border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-8 transition-all hover:border-dynamic-blue/50 hover:shadow-dynamic-blue/10 hover:shadow-lg">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue/10">
                  <Rocket className="h-6 w-6 text-dynamic-blue" />
                </div>
                <h3 className="mb-3 font-bold text-2xl">
                  {t('vision.vision.title')}
                </h3>
                <p className="text-foreground/70 leading-relaxed">
                  {t('vision.vision.description')}
                </p>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Core Beliefs Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('coreBeliefs.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-orange via-dynamic-red to-dynamic-pink bg-clip-text text-transparent">
                {t('coreBeliefs.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('coreBeliefs.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Zap,
                titleKey: 'coreBeliefs.focus.title',
                descKey: 'coreBeliefs.focus.description',
                color: 'yellow',
              },
              {
                icon: Heart,
                titleKey: 'coreBeliefs.technology.title',
                descKey: 'coreBeliefs.technology.description',
                color: 'red',
              },
              {
                icon: Shield,
                titleKey: 'coreBeliefs.transparency.title',
                descKey: 'coreBeliefs.transparency.description',
                color: 'blue',
              },
              {
                icon: Target,
                titleKey: 'coreBeliefs.impact.title',
                descKey: 'coreBeliefs.impact.description',
                color: 'green',
              },
              {
                icon: Globe,
                titleKey: 'coreBeliefs.potential.title',
                descKey: 'coreBeliefs.potential.description',
                color: 'purple',
              },
              {
                icon: Lightbulb,
                titleKey: 'coreBeliefs.thirdEra.title',
                descKey: 'coreBeliefs.thirdEra.description',
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
                    `border-dynamic-${belief.color}/30 bg-linear-to-br from-dynamic-${belief.color}/5 via-background to-background hover:border-dynamic-${belief.color}/50 hover:shadow-dynamic-${belief.color}/10`
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
                  <h3 className="mb-2 font-semibold text-lg">
                    {t(belief.titleKey as any)}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {t(belief.descKey as any)}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem Section */}
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
              className="mb-4 border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
            >
              {t('problem.badge')}
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('problem.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text text-transparent">
                {t('problem.title.highlight')}
              </span>
            </h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: FileText,
                titleKey: 'problem.financial.title',
                statKey: 'problem.financial.stat',
                descKey: 'problem.financial.description',
                color: 'red',
              },
              {
                icon: Brain,
                titleKey: 'problem.cognitive.title',
                statKey: 'problem.cognitive.stat',
                descKey: 'problem.cognitive.description',
                color: 'orange',
              },
              {
                icon: Lightbulb,
                titleKey: 'problem.innovation.title',
                statKey: 'problem.innovation.stat',
                descKey: 'problem.innovation.description',
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
                    `border-dynamic-${cost.color}/30 bg-linear-to-br from-dynamic-${cost.color}/5 via-background to-background hover:border-dynamic-${cost.color}/50 hover:shadow-dynamic-${cost.color}/10`
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
                  <h3 className="mb-2 font-bold text-xl">
                    {t(cost.titleKey as any)}
                  </h3>
                  <div
                    className={cn(
                      'mb-3 font-bold text-3xl',
                      `text-dynamic-${cost.color}`
                    )}
                  >
                    {t(cost.statKey as any)}
                  </div>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {t(cost.descKey as any)}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tuturuuu Ecosystem Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('ecosystem.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                {t('ecosystem.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('ecosystem.subtitle')}
            </p>
          </motion.div>

          <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Calendar,
                nameKey: 'ecosystem.tuplan.name',
                descKey: 'ecosystem.tuplan.description',
                color: 'blue',
              },
              {
                icon: CheckCircle2,
                nameKey: 'ecosystem.tudo.name',
                descKey: 'ecosystem.tudo.description',
                color: 'green',
              },
              {
                icon: Users,
                nameKey: 'ecosystem.tumeet.name',
                descKey: 'ecosystem.tumeet.description',
                color: 'purple',
              },
              {
                icon: MessageSquare,
                nameKey: 'ecosystem.tuchat.name',
                descKey: 'ecosystem.tuchat.description',
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
                    `border-dynamic-${app.color}/30 bg-linear-to-br from-dynamic-${app.color}/5 via-background to-background hover:border-dynamic-${app.color}/50 hover:shadow-dynamic-${app.color}/10`
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
                  <h3 className="mb-1 font-bold text-lg">
                    {t(app.nameKey as any)}
                  </h3>
                  <p className="text-foreground/60 text-sm">
                    {t(app.descKey as any)}
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
            <Card className="border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8">
              <div className="mb-6 text-center">
                <h3 className="mb-2 font-bold text-2xl">
                  {t('ecosystem.aiCore.title')}
                </h3>
                <p className="text-foreground/60">
                  {t('ecosystem.aiCore.subtitle')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    icon: Bot,
                    nameKey: 'ecosystem.aiCore.mira.name',
                    roleKey: 'ecosystem.aiCore.mira.role',
                    color: 'pink',
                  },
                  {
                    icon: Layers,
                    nameKey: 'ecosystem.aiCore.aurora.name',
                    roleKey: 'ecosystem.aiCore.aurora.role',
                    color: 'blue',
                  },
                  {
                    icon: Database,
                    nameKey: 'ecosystem.aiCore.rewise.name',
                    roleKey: 'ecosystem.aiCore.rewise.role',
                    color: 'purple',
                  },
                  {
                    icon: Cpu,
                    nameKey: 'ecosystem.aiCore.nova.name',
                    roleKey: 'ecosystem.aiCore.nova.role',
                    color: 'orange',
                  },
                  {
                    icon: Sparkles,
                    nameKey: 'ecosystem.aiCore.crystal.name',
                    roleKey: 'ecosystem.aiCore.crystal.role',
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
                    <h4 className="mb-1 font-semibold text-sm">
                      {t(ai.nameKey as any)}
                    </h4>
                    <p className="text-foreground/50 text-xs">
                      {t(ai.roleKey as any)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Technology Stack Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('techStack.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                {t('techStack.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('techStack.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                categoryKey: 'techStack.frontend.category',
                icon: Code2,
                techs: ['tech1', 'tech2', 'tech3', 'tech4'].map(
                  (k) => `techStack.frontend.${k}`
                ),
                color: 'cyan',
              },
              {
                categoryKey: 'techStack.backend.category',
                icon: Server,
                techs: ['tech1', 'tech2', 'tech3', 'tech4'].map(
                  (k) => `techStack.backend.${k}`
                ),
                color: 'green',
              },
              {
                categoryKey: 'techStack.infrastructure.category',
                icon: Package,
                techs: ['tech1', 'tech2', 'tech3', 'tech4'].map(
                  (k) => `techStack.infrastructure.${k}`
                ),
                color: 'blue',
              },
              {
                categoryKey: 'techStack.ai.category',
                icon: Brain,
                techs: ['tech1', 'tech2', 'tech3', 'tech4'].map(
                  (k) => `techStack.ai.${k}`
                ),
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
                  <h3 className="mb-3 font-bold text-lg">
                    {t(stack.categoryKey as any)}
                  </h3>
                  <ul className="space-y-1.5">
                    {stack.techs.map((techKey, techIndex) => (
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
                        {t(techKey as any)}
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
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('features.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                {t('features.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('features.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Wallet,
                titleKey: 'features.finance.title',
                descKey: 'features.finance.description',
                features: ['feature1', 'feature2', 'feature3'].map(
                  (k) => `features.finance.${k}`
                ),
                color: 'green',
              },
              {
                icon: Folder,
                titleKey: 'features.inventory.title',
                descKey: 'features.inventory.description',
                features: ['feature1', 'feature2', 'feature3'].map(
                  (k) => `features.inventory.${k}`
                ),
                color: 'orange',
              },
              {
                icon: GraduationCap,
                titleKey: 'features.learning.title',
                descKey: 'features.learning.description',
                features: ['feature1', 'feature2', 'feature3'].map(
                  (k) => `features.learning.${k}`
                ),
                color: 'purple',
              },
              {
                icon: BarChart3,
                titleKey: 'features.analytics.title',
                descKey: 'features.analytics.description',
                features: ['feature1', 'feature2', 'feature3'].map(
                  (k) => `features.analytics.${k}`
                ),
                color: 'blue',
              },
              {
                icon: Lock,
                titleKey: 'features.security.title',
                descKey: 'features.security.description',
                features: ['feature1', 'feature2', 'feature3'].map(
                  (k) => `features.security.${k}`
                ),
                color: 'red',
              },
              {
                icon: GitBranch,
                titleKey: 'features.openSource.title',
                descKey: 'features.openSource.description',
                features: ['feature1', 'feature2', 'feature3'].map(
                  (k) => `features.openSource.${k}`
                ),
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
                    `border-dynamic-${feature.color}/30 bg-linear-to-br from-dynamic-${feature.color}/5 via-background to-background hover:border-dynamic-${feature.color}/50 hover:shadow-dynamic-${feature.color}/10`
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
                  <h3 className="mb-2 font-bold text-xl">
                    {t(feature.titleKey as any)}
                  </h3>
                  <p className="mb-4 text-foreground/60 text-sm leading-relaxed">
                    {t(feature.descKey as any)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feature.features.map((featKey, featIndex) => (
                      <Badge
                        key={featIndex}
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          `border-dynamic-${feature.color}/30 bg-dynamic-${feature.color}/10 text-dynamic-${feature.color}`
                        )}
                      >
                        {t(featKey as any)}
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
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('timeline.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-yellow via-dynamic-orange to-dynamic-red bg-clip-text text-transparent">
                {t('timeline.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('timeline.subtitle')}
            </p>
          </motion.div>

          <div className="relative">
            {/* Timeline line - hidden on mobile, visible on md+ */}
            <div className="absolute top-0 bottom-0 left-1/2 hidden w-0.5 -translate-x-1/2 bg-linear-to-b from-dynamic-purple via-dynamic-blue to-dynamic-green md:block" />

            <div className="space-y-8 md:space-y-12">
              {[
                {
                  phaseKey: 'timeline.foundation.phase',
                  periodKey: 'timeline.foundation.period',
                  titleKey: 'timeline.foundation.title',
                  descKey: 'timeline.foundation.description',
                  achievements: ['achievement1', 'achievement2'].map(
                    (k) => `timeline.foundation.${k}`
                  ),
                  icon: Lightbulb,
                  color: 'yellow',
                },
                {
                  phaseKey: 'timeline.building.phase',
                  periodKey: 'timeline.building.period',
                  titleKey: 'timeline.building.title',
                  descKey: 'timeline.building.description',
                  achievements: [
                    'achievement1',
                    'achievement2',
                    'achievement3',
                    'achievement4',
                  ].map((k) => `timeline.building.${k}`),
                  icon: Rocket,
                  color: 'blue',
                },
                {
                  phaseKey: 'timeline.launch.phase',
                  periodKey: 'timeline.launch.period',
                  titleKey: 'timeline.launch.title',
                  descKey: 'timeline.launch.description',
                  achievements: ['achievement1', 'achievement2'].map(
                    (k) => `timeline.launch.${k}`
                  ),
                  icon: Building2,
                  color: 'purple',
                },
                {
                  phaseKey: 'timeline.evolution.phase',
                  periodKey: 'timeline.evolution.period',
                  titleKey: 'timeline.evolution.title',
                  descKey: 'timeline.evolution.description',
                  achievements: [
                    'achievement1',
                    'achievement2',
                    'achievement3',
                  ].map((k) => `timeline.evolution.${k}`),
                  icon: Sparkles,
                  color: 'pink',
                },
              ].map((milestone, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  {/* Mobile: simple stacked layout, Desktop: alternating grid */}
                  <div
                    className={cn(
                      'md:grid md:grid-cols-2 md:gap-8',
                      index % 2 === 0 ? '' : 'md:grid-flow-dense'
                    )}
                  >
                    {/* Content Card */}
                    <div
                      className={cn(
                        'relative',
                        index % 2 === 0 ? 'md:pr-12' : 'md:col-start-2 md:pl-12'
                      )}
                    >
                      <Card
                        className={cn(
                          'p-6 transition-all hover:shadow-lg',
                          `border-dynamic-${milestone.color}/30 bg-linear-to-br from-dynamic-${milestone.color}/5 via-background to-background hover:border-dynamic-${milestone.color}/50 hover:shadow-dynamic-${milestone.color}/10`
                        )}
                      >
                        <Badge
                          variant="secondary"
                          className={cn(
                            'mb-3',
                            `border-dynamic-${milestone.color}/30 bg-dynamic-${milestone.color}/10 text-dynamic-${milestone.color}`
                          )}
                        >
                          {t(milestone.phaseKey as any)}
                        </Badge>
                        <h3 className="mb-1 font-bold text-2xl">
                          {t(milestone.titleKey as any)}
                        </h3>
                        <p className="mb-3 text-foreground/50 text-sm">
                          {t(milestone.periodKey as any)}
                        </p>
                        <p className="mb-4 text-foreground/70 leading-relaxed">
                          {t(milestone.descKey as any)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {milestone.achievements.map((achKey, achIndex) => (
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
                              {t(achKey as any)}
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>

                    {/* Timeline node - hidden on mobile, shown on desktop */}
                    <div className="absolute top-6 left-1/2 hidden -translate-x-1/2 md:block">
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-4 border-background bg-background shadow-lg lg:h-16 lg:w-16">
                        <div
                          className={cn(
                            'absolute inset-1 rounded-full',
                            `bg-dynamic-${milestone.color}/20`
                          )}
                        />
                        <milestone.icon
                          className={cn(
                            'relative z-10 h-6 w-6 lg:h-8 lg:w-8',
                            `text-dynamic-${milestone.color}`
                          )}
                        />
                      </div>
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
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('community.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                {t('community.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('community.subtitle')}
            </p>
          </motion.div>

          <div className="mb-12 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                titleKey: 'community.openSource.title',
                valueKey: 'community.openSource.value',
                descKey: 'community.openSource.description',
                color: 'blue',
              },
              {
                icon: GitBranch,
                titleKey: 'community.contributions.title',
                valueKey: 'community.contributions.value',
                descKey: 'community.contributions.description',
                color: 'green',
              },
              {
                icon: Trophy,
                titleKey: 'community.milestones.title',
                valueKey: 'community.milestones.value',
                descKey: 'community.milestones.description',
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
                    `border-dynamic-${stat.color}/30 bg-linear-to-br from-dynamic-${stat.color}/5 via-background to-background hover:border-dynamic-${stat.color}/50 hover:shadow-dynamic-${stat.color}/10`
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
                    {t(stat.valueKey as any)}
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">
                    {t(stat.titleKey as any)}
                  </h3>
                  <p className="text-foreground/60 text-sm">
                    {t(stat.descKey as any)}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 md:p-12">
            <div className="mb-8 text-center">
              <h3 className="mb-3 font-bold text-3xl">
                {t('community.culture.title')}
              </h3>
              <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
                {t('community.culture.subtitle')}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  titleKey: 'community.culture.builders.title',
                  descKey: 'community.culture.builders.description',
                  icon: Settings,
                },
                {
                  titleKey: 'community.culture.optimism.title',
                  descKey: 'community.culture.optimism.description',
                  icon: TrendingUp,
                },
                {
                  titleKey: 'community.culture.ownership.title',
                  descKey: 'community.culture.ownership.description',
                  icon: Shield,
                },
                {
                  titleKey: 'community.culture.transparency.title',
                  descKey: 'community.culture.transparency.description',
                  icon: Search,
                },
                {
                  titleKey: 'community.culture.vietnam.title',
                  descKey: 'community.culture.vietnam.description',
                  icon: Globe,
                },
                {
                  titleKey: 'community.culture.innovation.title',
                  descKey: 'community.culture.innovation.description',
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
                  <h4 className="mb-2 font-semibold">
                    {t(value.titleKey as any)}
                  </h4>
                  <p className="text-foreground/60 text-sm">
                    {t(value.descKey as any)}
                  </p>
                </motion.div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* Company Info Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-8 md:p-12">
              <div className="mb-8 flex items-start gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-dynamic-blue/10">
                  <Building2 className="h-8 w-8 text-dynamic-blue" />
                </div>
                <div>
                  <h2 className="mb-2 font-bold text-3xl">
                    {t('companyInfo.title')}
                  </h2>
                  <p className="text-foreground/60">
                    {t('companyInfo.subtitle')}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 font-semibold text-dynamic-blue text-sm uppercase tracking-wide">
                    {t('companyInfo.details.title')}
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-foreground/50">
                        {t('companyInfo.details.taxCode')}
                      </dt>
                      <dd className="text-foreground">
                        {t('companyInfo.details.taxCodeValue')}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/50">
                        {t('companyInfo.details.founded')}
                      </dt>
                      <dd className="text-foreground">
                        {t('companyInfo.details.foundedValue')}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/50">
                        {t('companyInfo.details.ceo')}
                      </dt>
                      <dd className="text-foreground">
                        {t('companyInfo.details.ceoValue')}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="mb-3 font-semibold text-dynamic-blue text-sm uppercase tracking-wide">
                    {t('companyInfo.location.title')}
                  </h3>
                  <p className="text-foreground/70 text-sm leading-relaxed">
                    {t('companyInfo.location.address1')}
                    <br />
                    {t('companyInfo.location.address2')}
                    <br />
                    {t('companyInfo.location.address3')}
                    <br />
                    {t('companyInfo.location.address4')}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 border-dynamic-blue/20 border-t pt-8">
                <Button variant="outline" size="sm" asChild>
                  <Link href="https://tuturuuu.com" target="_blank">
                    <Globe className="mr-2 h-4 w-4" />
                    {t('companyInfo.links.website')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href="https://github.com/tutur3u/platform"
                    target="_blank"
                  >
                    <Layers className="mr-2 h-4 w-4" />
                    {t('companyInfo.links.github')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="mailto:contact@tuturuuu.com">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t('companyInfo.links.contact')}
                  </Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                {t('cta.title')}
              </h2>
              <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg">
                {t('cta.description')}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button size="lg" asChild>
                  <Link
                    href="https://github.com/tutur3u/platform"
                    target="_blank"
                  >
                    <Layers className="mr-2 h-5 w-5" />
                    {t('cta.contribute')}
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="mailto:contact@tuturuuu.com">
                    {t('cta.getInTouch')}
                  </Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
