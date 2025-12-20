'use client';

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
  Star,
  Target,
  TrendingUp,
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

export default function MarketingPage() {
  const t = useTranslations('landing');
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
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160"
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
          className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140"
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
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-180 sm:w-180"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-size-[32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-size-[120px]" />
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
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              {t('hero.title.part1')}{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                {t('hero.title.part2')}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              {t('hero.description.part1')}{' '}
              <strong className="text-foreground">Tuturuuu</strong>{' '}
              {t('hero.description.part2')}
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
                <Link href="/onboarding">
                  {t('hero.cta.getStarted')}
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full transition-all hover:scale-105 sm:w-auto"
                asChild
              >
                <Link href="#features">
                  <Layers className="mr-2 h-5 w-5" />
                  {t('hero.cta.exploreFeatures')}
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
                  <GitBranch className="mr-2 h-5 w-5" />
                  {t('hero.cta.viewGitHub')}
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
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                {t('hero.trust.openSource')}
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                {t('hero.trust.commits')}
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                {t('hero.trust.contributors')}
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                {t('hero.trust.freePlan')}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Impact Stats Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('digitalFriction.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                {t('digitalFriction.title.highlight')}
              </span>{' '}
              {t('digitalFriction.title.part2')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('digitalFriction.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Clock,
                titleKey: 'digitalFriction.stats.hoursLost.title',
                subtitleKey: 'digitalFriction.stats.hoursLost.subtitle',
                descriptionKey: 'digitalFriction.stats.hoursLost.description',
                trendKey: 'digitalFriction.stats.hoursLost.trend',
                color: 'red',
              },
              {
                icon: Brain,
                titleKey: 'digitalFriction.stats.productivityLoss.title',
                subtitleKey: 'digitalFriction.stats.productivityLoss.subtitle',
                descriptionKey:
                  'digitalFriction.stats.productivityLoss.description',
                trendKey: 'digitalFriction.stats.productivityLoss.trend',
                color: 'orange',
              },
              {
                icon: TrendingUp,
                titleKey: 'digitalFriction.stats.globalCost.title',
                subtitleKey: 'digitalFriction.stats.globalCost.subtitle',
                descriptionKey: 'digitalFriction.stats.globalCost.description',
                trendKey: 'digitalFriction.stats.globalCost.trend',
                color: 'yellow',
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
                    {t(stat.titleKey as any)}
                  </div>
                  <div className="mb-3 font-medium text-foreground/80 text-sm uppercase tracking-wide">
                    {t(stat.subtitleKey as any)}
                  </div>
                  <p className="mb-4 text-foreground/60 text-sm leading-relaxed">
                    {t(stat.descriptionKey as any)}
                  </p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      `border-dynamic-${stat.color}/30 bg-dynamic-${stat.color}/10 text-dynamic-${stat.color}`
                    )}
                  >
                    {t(stat.trendKey as any)}
                  </Badge>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center sm:mb-16"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('features.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
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
                icon: Calendar,
                appKey: 'tuplan',
                featureKeys: ['sync', 'scheduling', 'blocking'],
                color: 'blue',
              },
              {
                icon: CheckCircle2,
                appKey: 'tudo',
                featureKeys: ['kanban', 'hierarchical', 'management'],
                color: 'green',
              },
              {
                icon: Users,
                appKey: 'tumeet',
                featureKeys: ['plans', 'transcription', 'tracking'],
                color: 'purple',
              },
              {
                icon: MessageSquare,
                appKey: 'tuchat',
                featureKeys: ['chat', 'insights', 'routing'],
                color: 'cyan',
              },
              {
                icon: Wallet,
                appKey: 'tufinance',
                featureKeys: ['tracking', 'planning', 'analytics'],
                color: 'green',
              },
              {
                icon: GraduationCap,
                appKey: 'nova',
                featureKeys: ['challenges', 'tracking', 'leaderboards'],
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
                  <div className="mb-1 font-bold text-xl">
                    {t(`features.apps.${feature.appKey}.title` as any)}
                  </div>
                  <div className="mb-3 text-foreground/60 text-sm">
                    {t(`features.apps.${feature.appKey}.subtitle` as any)}
                  </div>
                  <p className="mb-4 text-foreground/70 text-sm leading-relaxed">
                    {t(`features.apps.${feature.appKey}.description` as any)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feature.featureKeys.map((featKey, featIndex) => (
                      <Badge
                        key={featIndex}
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          `border-dynamic-${feature.color}/30 bg-dynamic-${feature.color}/10 text-dynamic-${feature.color}`
                        )}
                      >
                        {t(
                          `features.apps.${feature.appKey}.features.${featKey}` as any
                        )}
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
        <div className="mx-auto max-w-7xl">
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
              {t('demo.badge')}
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('demo.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                {t('demo.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('demo.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Task Management Demo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full overflow-hidden border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background p-4 sm:p-6 md:p-8">
                <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-green/10 sm:h-14 sm:w-14">
                    <CheckCircle2 className="h-6 w-6 text-dynamic-green sm:h-7 sm:w-7" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-xl sm:text-2xl">
                      {t('demo.taskManagement.title')}
                    </h3>
                    <p className="text-foreground/60 text-xs sm:text-sm">
                      {t('demo.taskManagement.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  {/* Sample Task Cards */}
                  <div className="group rounded-lg border border-dynamic-green/20 bg-background/50 p-3 transition-all hover:border-dynamic-green/40 hover:shadow-md sm:p-4">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-5 w-5 items-center justify-center rounded border-2 border-dynamic-green/30 transition-colors group-hover:border-dynamic-green group-hover:bg-dynamic-green/10">
                          <Check className="h-3 w-3 text-dynamic-green opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            {t('demo.taskManagement.task1.title')}
                          </div>
                          <div className="flex items-center gap-2 text-foreground/50 text-xs">
                            <Clock className="h-3 w-3" />
                            {t('demo.taskManagement.task1.dueDate')}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange text-xs"
                      >
                        {t('demo.taskManagement.task1.priority')}
                      </Badge>
                    </div>
                    <div className="ml-8 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                      >
                        <FileText className="mr-1 h-3 w-3" />
                        {t('demo.taskManagement.task1.files')}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple text-xs"
                      >
                        <Users className="mr-1 h-3 w-3" />
                        {t('demo.taskManagement.task1.assignees')}
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
                            {t('demo.taskManagement.task2.title')}
                          </div>
                          <div className="flex items-center gap-2 text-foreground/50 text-xs">
                            <Clock className="h-3 w-3" />
                            {t('demo.taskManagement.task2.dueDate')}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                      >
                        {t('demo.taskManagement.task2.priority')}
                      </Badge>
                    </div>
                    <div className="ml-8 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green text-xs"
                      >
                        <Code2 className="mr-1 h-3 w-3" />
                        {t('demo.taskManagement.task2.tag')}
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
                            {t('demo.taskManagement.task3.title')}
                          </div>
                          <div className="flex items-center gap-2 text-foreground/50 text-xs">
                            <Calendar className="h-3 w-3" />
                            {t('demo.taskManagement.task3.dueDate')}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow text-xs"
                      >
                        {t('demo.taskManagement.task3.priority')}
                      </Badge>
                    </div>
                    <div className="ml-8 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink text-xs"
                      >
                        <Heart className="mr-1 h-3 w-3" />
                        {t('demo.taskManagement.task3.tag')}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-dynamic-green/10 p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-dynamic-green" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        {t('demo.taskManagement.aiInsight.title')}
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        {t('demo.taskManagement.aiInsight.description')}
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <Target className="mr-2 h-4 w-4" />
                    {t('demo.taskManagement.cta')}
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
              <Card className="h-full overflow-hidden border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-4 sm:p-6 md:p-8">
                <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue/10 sm:h-14 sm:w-14">
                    <Calendar className="h-6 w-6 text-dynamic-blue sm:h-7 sm:w-7" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-xl sm:text-2xl">
                      {t('demo.calendar.title')}
                    </h3>
                    <p className="text-foreground/60 text-xs sm:text-sm">
                      {t('demo.calendar.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  {/* Today's Schedule */}
                  <div className="rounded-lg border border-dynamic-blue/20 bg-background/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold text-sm">
                        {t('demo.calendar.todaySchedule')}
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                      >
                        {t('demo.calendar.eventCount')}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {/* Event 1 */}
                      <div className="flex gap-3 rounded-md bg-dynamic-purple/10 p-3 transition-colors hover:bg-dynamic-purple/20">
                        <div className="shrink-0 text-center">
                          <div className="font-semibold text-dynamic-purple text-xs">
                            {t('demo.calendar.event1.time')}
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            {t('demo.calendar.event1.period')}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-dynamic-purple border-l-2 pl-3">
                          <div className="font-medium text-sm">
                            {t('demo.calendar.event1.title')}
                          </div>
                          <div className="flex items-center gap-2 text-foreground/60 text-xs">
                            <Users className="h-3 w-3" />
                            {t('demo.calendar.event1.meta')}
                          </div>
                        </div>
                      </div>

                      {/* Event 2 */}
                      <div className="flex gap-3 rounded-md bg-dynamic-green/10 p-3 transition-colors hover:bg-dynamic-green/20">
                        <div className="shrink-0 text-center">
                          <div className="font-semibold text-dynamic-green text-xs">
                            {t('demo.calendar.event2.time')}
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            {t('demo.calendar.event2.period')}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-dynamic-green border-l-2 pl-3">
                          <div className="font-medium text-sm">
                            {t('demo.calendar.event2.title')}
                          </div>
                          <div className="flex items-center gap-2 text-foreground/60 text-xs">
                            <Zap className="h-3 w-3" />
                            {t('demo.calendar.event2.meta')}
                          </div>
                        </div>
                      </div>

                      {/* Event 3 */}
                      <div className="flex gap-3 rounded-md bg-dynamic-orange/10 p-3 transition-colors hover:bg-dynamic-orange/20">
                        <div className="shrink-0 text-center">
                          <div className="font-semibold text-dynamic-orange text-xs">
                            {t('demo.calendar.event3.time')}
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            {t('demo.calendar.event3.period')}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 border-dynamic-orange border-l-2 pl-3">
                          <div className="font-medium text-sm">
                            {t('demo.calendar.event3.title')}
                          </div>
                          <div className="flex items-center gap-2 text-foreground/60 text-xs">
                            <Globe className="h-3 w-3" />
                            {t('demo.calendar.event3.meta')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Time Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-3 text-center">
                      <div className="mb-1 font-bold text-2xl text-dynamic-green">
                        {t('demo.calendar.stats.focusTime.value')}
                      </div>
                      <div className="text-foreground/60 text-xs">
                        {t('demo.calendar.stats.focusTime.label')}
                      </div>
                    </div>
                    <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3 text-center">
                      <div className="mb-1 font-bold text-2xl text-dynamic-blue">
                        {t('demo.calendar.stats.optimized.value')}
                      </div>
                      <div className="text-foreground/60 text-xs">
                        {t('demo.calendar.stats.optimized.label')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-dynamic-blue/10 p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-dynamic-blue" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        {t('demo.calendar.smartSuggestion.title')}
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        {t('demo.calendar.smartSuggestion.description')}
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <Calendar className="mr-2 h-4 w-4" />
                    {t('demo.calendar.cta')}
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
              <Card className="h-full overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-4 sm:p-6 md:p-8">
                <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-purple/10 sm:h-14 sm:w-14">
                    <Bot className="h-6 w-6 text-dynamic-purple sm:h-7 sm:w-7" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-xl sm:text-2xl">
                      {t('demo.aiChat.title')}
                    </h3>
                    <p className="text-foreground/60 text-xs sm:text-sm">
                      {t('demo.aiChat.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Chat Messages */}
                  <div className="space-y-3 rounded-lg border border-dynamic-purple/20 bg-background/50 p-3 sm:p-4">
                    {/* User Message */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg bg-dynamic-blue/20 px-3 py-2 sm:max-w-[80%] sm:px-4">
                        <p className="text-xs leading-relaxed sm:text-sm">
                          {t('demo.aiChat.userMessage1')}
                        </p>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/20 sm:h-8 sm:w-8">
                        <Bot className="h-3.5 w-3.5 text-dynamic-purple sm:h-4 sm:w-4" />
                      </div>
                      <div className="max-w-[85%] rounded-lg bg-dynamic-purple/10 px-3 py-2 sm:max-w-[80%] sm:px-4">
                        <p className="mb-2 text-xs leading-relaxed sm:text-sm">
                          {t('demo.aiChat.aiResponse1.intro')}
                        </p>
                        <ul className="space-y-1 text-xs sm:text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-dynamic-green" />
                            <span>{t('demo.aiChat.aiResponse1.item1')}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-dynamic-green" />
                            <span>{t('demo.aiChat.aiResponse1.item2')}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-dynamic-green" />
                            <span>{t('demo.aiChat.aiResponse1.item3')}</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* User Message */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg bg-dynamic-blue/20 px-3 py-2 sm:max-w-[80%] sm:px-4">
                        <p className="text-xs leading-relaxed sm:text-sm">
                          {t('demo.aiChat.userMessage2')}
                        </p>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/20 sm:h-8 sm:w-8">
                        <Bot className="h-3.5 w-3.5 text-dynamic-purple sm:h-4 sm:w-4" />
                      </div>
                      <div className="max-w-[85%] rounded-lg bg-dynamic-purple/10 px-3 py-2 sm:max-w-[80%] sm:px-4">
                        <p className="text-xs leading-relaxed sm:text-sm">
                          I've found 3 available slots. The best option is
                          Friday at 3 PM based on everyone's calendar. Shall I
                          send the update?
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs transition-colors hover:bg-dynamic-blue/20"
                    >
                      {t('demo.aiChat.quickActions.tasks')}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green text-xs transition-colors hover:bg-dynamic-green/20"
                    >
                      {t('demo.aiChat.quickActions.reminder')}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple text-xs transition-colors hover:bg-dynamic-purple/20"
                    >
                      {t('demo.aiChat.quickActions.summary')}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-dynamic-purple/10 p-3 sm:mt-6 sm:p-4">
                  <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                    <Brain className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-purple sm:mt-0 sm:h-5 sm:w-5" />
                    <div className="flex-1">
                      <div className="mb-1 font-semibold text-sm">
                        {t('demo.aiChat.contextAware.title')}
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed sm:text-xs">
                        {t('demo.aiChat.contextAware.description')}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  className="mt-4 w-full sm:mt-6"
                  variant="outline"
                  asChild
                >
                  <Link href="/onboarding">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t('demo.aiChat.cta')}
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
              <Card className="h-full overflow-hidden border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/5 via-background to-background p-4 sm:p-6 md:p-8">
                <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-cyan/10 sm:h-14 sm:w-14">
                    <BarChart3 className="h-6 w-6 text-dynamic-cyan sm:h-7 sm:w-7" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-xl sm:text-2xl">
                      {t('demo.analytics.title')}
                    </h3>
                    <p className="text-foreground/60 text-xs sm:text-sm">
                      {t('demo.analytics.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-3 sm:p-4">
                      <div className="mb-1 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-dynamic-green sm:h-4 sm:w-4" />
                        <span className="font-semibold text-[10px] sm:text-xs">
                          {t('demo.analytics.metrics.tasks.label')}
                        </span>
                      </div>
                      <div className="font-bold text-dynamic-green text-xl sm:text-2xl">
                        {t('demo.analytics.metrics.tasks.value')}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-foreground/60 sm:text-xs">
                        <ArrowRight className="h-2.5 w-2.5 -rotate-45 sm:h-3 sm:w-3" />
                        {t('demo.analytics.metrics.tasks.change')}
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3 sm:p-4">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-dynamic-blue sm:h-4 sm:w-4" />
                        <span className="font-semibold text-[10px] sm:text-xs">
                          {t('demo.analytics.metrics.focus.label')}
                        </span>
                      </div>
                      <div className="font-bold text-dynamic-blue text-xl sm:text-2xl">
                        {t('demo.analytics.metrics.focus.value')}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-foreground/60 sm:text-xs">
                        <ArrowRight className="h-2.5 w-2.5 -rotate-45 sm:h-3 sm:w-3" />
                        {t('demo.analytics.metrics.focus.change')}
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-3 sm:p-4">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-dynamic-purple sm:h-4 sm:w-4" />
                        <span className="font-semibold text-[10px] sm:text-xs">
                          {t('demo.analytics.metrics.meetings.label')}
                        </span>
                      </div>
                      <div className="font-bold text-dynamic-purple text-xl sm:text-2xl">
                        {t('demo.analytics.metrics.meetings.value')}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-foreground/60 sm:text-xs">
                        <ArrowRight className="h-2.5 w-2.5 rotate-45 sm:h-3 sm:w-3" />
                        {t('demo.analytics.metrics.meetings.change')}
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3 sm:p-4">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-dynamic-orange sm:h-4 sm:w-4" />
                        <span className="font-semibold text-[10px] sm:text-xs">
                          {t('demo.analytics.metrics.goals.label')}
                        </span>
                      </div>
                      <div className="font-bold text-dynamic-orange text-xl sm:text-2xl">
                        {t('demo.analytics.metrics.goals.value')}
                      </div>
                      <div className="text-[10px] text-foreground/60 sm:text-xs">
                        {t('demo.analytics.metrics.goals.subtitle')}
                      </div>
                    </div>
                  </div>

                  {/* Productivity Score */}
                  <div className="rounded-lg border border-dynamic-cyan/20 bg-background/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold text-sm">
                        {t('demo.analytics.productivityScore.title')}
                      </div>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan"
                      >
                        {t('demo.analytics.productivityScore.badge')}
                      </Badge>
                    </div>
                    <div className="mb-2 h-3 overflow-hidden rounded-full bg-dynamic-cyan/20">
                      <div className="h-full w-[87%] rounded-full bg-linear-to-r from-dynamic-cyan to-dynamic-blue" />
                    </div>
                    <div className="flex items-center justify-between text-foreground/60 text-xs">
                      <span>{t('demo.analytics.productivityScore.value')}</span>
                      <span>{t('demo.analytics.productivityScore.rank')}</span>
                    </div>
                  </div>

                  {/* Weekly Breakdown */}
                  <div className="rounded-lg border border-dynamic-blue/20 bg-background/50 p-4">
                    <div className="mb-3 font-semibold text-sm">
                      {t('demo.analytics.weeklyDistribution.title')}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-foreground/60 text-xs">
                          {t(
                            'demo.analytics.weeklyDistribution.deepWork.label'
                          )}
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full w-[65%] bg-dynamic-green" />
                        </div>
                        <div className="w-12 text-right text-foreground/60 text-xs">
                          {t(
                            'demo.analytics.weeklyDistribution.deepWork.value'
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-foreground/60 text-xs">
                          {t(
                            'demo.analytics.weeklyDistribution.meetings.label'
                          )}
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full w-[20%] bg-dynamic-purple" />
                        </div>
                        <div className="w-12 text-right text-foreground/60 text-xs">
                          {t(
                            'demo.analytics.weeklyDistribution.meetings.value'
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-foreground/60 text-xs">
                          {t('demo.analytics.weeklyDistribution.admin.label')}
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full w-[15%] bg-dynamic-orange" />
                        </div>
                        <div className="w-12 text-right text-foreground/60 text-xs">
                          {t('demo.analytics.weeklyDistribution.admin.value')}
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
                        {t('demo.analytics.performance.title')}
                      </div>
                      <p className="text-foreground/70 text-xs leading-relaxed">
                        {t('demo.analytics.performance.description')}
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/onboarding">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    {t('demo.analytics.cta')}
                  </Link>
                </Button>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section
        id="pricing"
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
              {t('pricing.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                {t('pricing.title.highlight')}
              </span>{' '}
              {t('pricing.title.part2')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('pricing.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Early Bird Plan */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background p-8">
                <Badge
                  variant="secondary"
                  className="mb-4 border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {t('pricing.earlyBird.badge')}
                </Badge>
                <h3 className="mb-2 font-bold text-3xl">
                  {t('pricing.earlyBird.title')}
                </h3>
                <p className="mb-4 text-foreground/60 text-sm">
                  {t('pricing.earlyBird.subtitle')}
                </p>
                <div className="mb-6">
                  <span className="font-bold text-5xl">
                    {t('pricing.earlyBird.price')}
                  </span>
                  <span className="text-foreground/60">
                    /{t('pricing.earlyBird.period')}
                  </span>
                </div>
                <p className="mb-6 text-foreground/70 text-sm leading-relaxed">
                  {t('pricing.earlyBird.description')}
                </p>
                <ul className="mb-8 space-y-3">
                  {[
                    'feature1',
                    'feature2',
                    'feature3',
                    'feature4',
                    'feature5',
                    'feature6',
                    'feature7',
                    'feature8',
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-green" />
                      <span className="text-sm">
                        {t(`pricing.earlyBird.features.${feature}` as any)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" size="lg" asChild>
                  <Link href="/onboarding">
                    <Rocket className="mr-2 h-5 w-5" />
                    {t('pricing.earlyBird.cta')}
                  </Link>
                </Button>
                <p className="mt-4 text-center text-foreground/60 text-sm">
                  {t('pricing.earlyBird.note')}
                </p>
              </Card>
            </motion.div>

            {/* Experimental Features */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8">
                <Badge
                  variant="secondary"
                  className="mb-4 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  {t('pricing.experimental.badge')}
                </Badge>
                <h3 className="mb-2 font-bold text-3xl">
                  {t('pricing.experimental.title')}
                </h3>
                <p className="mb-4 text-foreground/60 text-sm">
                  {t('pricing.experimental.subtitle')}
                </p>
                <div className="mb-6">
                  <span className="font-bold text-5xl">
                    {t('pricing.experimental.price')}
                  </span>
                  <span className="text-foreground/60">
                    /{t('pricing.experimental.period')}
                  </span>
                </div>
                <p className="mb-6 text-foreground/70 text-sm leading-relaxed">
                  {t('pricing.experimental.description')}
                </p>
                <ul className="mb-8 space-y-3">
                  {[
                    'feature1',
                    'feature2',
                    'feature3',
                    'feature4',
                    'feature5',
                    'feature6',
                    'feature7',
                    'feature8',
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-purple" />
                      <span className="text-sm">
                        {t(`pricing.experimental.features.${feature}` as any)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" size="lg" variant="outline" asChild>
                  <Link href="/contact">
                    <MessageSquare className="mr-2 h-5 w-5" />
                    {t('pricing.experimental.cta')}
                  </Link>
                </Button>
                <p className="mt-4 text-center text-foreground/60 text-sm">
                  {t('pricing.experimental.note')}
                </p>
              </Card>
            </motion.div>
          </div>

          {/* Future Plans Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12"
          >
            <Card className="border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-8 text-center">
              <h3 className="mb-4 font-bold text-2xl">
                {t('pricing.future.title')}
              </h3>
              <p className="mx-auto mb-6 max-w-2xl text-foreground/70 leading-relaxed">
                {t('pricing.future.description')}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-6">
                {['benefit1', 'benefit2', 'benefit3'].map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-center gap-2 text-sm"
                  >
                    <CheckCircle2 className="h-5 w-5 text-dynamic-blue" />
                    <span>
                      {t(`pricing.future.benefits.${benefit}` as any)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* FAQ Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16"
          >
            <h3 className="mb-8 text-center font-bold text-3xl">
              {t('pricing.faq.title')}
            </h3>
            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
              {['q1', 'q2', 'q3', 'q4'].map((q) => (
                <Card
                  key={q}
                  className="border-foreground/10 bg-background/50 p-6"
                >
                  <h4 className="mb-3 font-semibold">
                    {t(`pricing.faq.${q}.question` as any)}
                  </h4>
                  <p className="text-foreground/70 text-sm leading-relaxed">
                    {t(`pricing.faq.${q}.answer` as any)}
                  </p>
                </Card>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* AI Core Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              {t('demo.aiCore.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                {t('demo.aiCore.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('demo.aiCore.subtitle')}
            </p>
          </motion.div>

          <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8 md:p-12">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Mira Highlight */}
              <div className="lg:col-span-2">
                <div className="flex flex-col items-start gap-6 md:flex-row">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-pink/20 to-dynamic-purple/20">
                    <Bot className="h-10 w-10 text-dynamic-pink" />
                  </div>
                  <div>
                    <h3 className="mb-2 font-bold text-3xl">
                      {t('demo.aiCore.mira.title')}
                    </h3>
                    <p className="mb-4 text-foreground/70 text-lg leading-relaxed">
                      {t('demo.aiCore.mira.description')}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Badge
                        variant="secondary"
                        className="border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink"
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        {t('demo.aiCore.mira.badges.proactive')}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
                      >
                        <Brain className="mr-1.5 h-3.5 w-3.5" />
                        {t('demo.aiChat.contextAware.title')}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
                      >
                        <Zap className="mr-1.5 h-3.5 w-3.5" />
                        {t('demo.aiCore.mira.badges.learning')}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Components Grid */}
              {[
                {
                  icon: Layers,
                  nameKey: 'demo.aiCore.components.aurora.name',
                  roleKey: 'demo.aiCore.components.aurora.role',
                  descriptionKey: 'demo.aiCore.components.aurora.description',
                  color: 'blue',
                },
                {
                  icon: Database,
                  nameKey: 'demo.aiCore.components.rewise.name',
                  roleKey: 'demo.aiCore.components.rewise.role',
                  descriptionKey: 'demo.aiCore.components.rewise.description',
                  color: 'purple',
                },
                {
                  icon: Cpu,
                  nameKey: 'demo.aiCore.components.nova.name',
                  roleKey: 'demo.aiCore.components.nova.role',
                  descriptionKey: 'demo.aiCore.components.nova.description',
                  color: 'orange',
                },
                {
                  icon: Sparkles,
                  nameKey: 'demo.aiCore.components.crystal.name',
                  roleKey: 'demo.aiCore.components.crystal.role',
                  descriptionKey: 'demo.aiCore.components.crystal.description',
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
                  <h4 className="mb-1 font-bold text-lg">
                    {t(ai.nameKey as any)}
                  </h4>
                  <div className="mb-2 text-foreground/60 text-sm">
                    {t(ai.roleKey as any)}
                  </div>
                  <p className="text-foreground/70 text-sm leading-relaxed">
                    {t(ai.descriptionKey as any)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
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
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  {t('cta.title')}
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  {t('cta.description')}
                </p>

                <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="/onboarding">
                      <Rocket className="mr-2 h-5 w-5" />
                      {t('cta.getStarted')}
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/about">
                      <Heart className="mr-2 h-5 w-5" />
                      {t('cta.learnStory')}
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link
                      href="https://github.com/tutur3u/platform"
                      target="_blank"
                    >
                      <Star className="mr-2 h-5 w-5" />
                      {t('cta.starGitHub')}
                    </Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/60 text-sm">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-dynamic-green" />
                    {t('cta.trust.openSource')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-dynamic-blue" />
                    {t('cta.trust.security')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-dynamic-purple" />
                    {t('cta.trust.selfHost')}
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
