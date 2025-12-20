'use client';

import {
  ArrowRight,
  CalendarDays,
  CheckCircle,
  Clock,
  GraduationCap,
  MapPin,
  RocketIcon,
  School,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserCheck,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { motion, type Variants } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';
import AiFeatures from './ai-features';
import AnimatedTimeline from './animated-timeline';
import FeatureShowcase from './feature-showcase';

// Dynamically import HeroAnimation with no SSR to prevent hydration issues
const HeroAnimation = dynamic(() => import('./hero-animation'), {
  ssr: false,
});

export default function MarketingPage() {
  const t = useTranslations('nova');

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.15,
        duration: 0.8,
        ease: 'easeOut',
      },
    },
  } satisfies Variants;

  const cardVariants = {
    hidden: { scale: 0.95, opacity: 0, y: 20 },
    show: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
    hover: {
      scale: 1.03,
      y: -5,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 10,
      },
    },
  } satisfies Variants;

  // Enhanced floating effect variants with reduced movement for better performance
  const floatingVariants = {
    initial: { y: 0 },
    float: {
      y: [-8, 8],
      transition: {
        duration: 5,
        repeat: Infinity,
        repeatType: 'mirror',
        ease: 'easeInOut',
      },
    },
  } satisfies Variants;

  return (
    <>
      <HeroAnimation />
      <div className="relative flex h-full min-h-screen w-full flex-col items-center will-change-transform">
        <section id="hero" className="relative w-full">
          <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 sm:py-32">
            {/* Existing hero content */}
            <motion.div
              variants={floatingVariants}
              initial="initial"
              animate="float"
              className="relative"
            >
              <Badge
                variant="outline"
                className="group relative mb-8 overflow-hidden border-transparent backdrop-blur-sm"
              >
                <motion.div
                  className="absolute inset-0 bg-foreground/10 opacity-100 transition-opacity"
                  whileHover={{ opacity: 1 }}
                />
                <Sparkles className="mr-2 h-4 w-4" />
                <span className="relative z-10">{t('badge')}</span>
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mb-6 text-balance text-center font-bold text-4xl text-foreground tracking-tight md:text-6xl lg:text-7xl"
            >
              {t('title')}
              <br />
              <GradientHeadline title="Prompt Engineering" />
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="mb-8 max-w-2xl text-balance text-center text-foreground/50 text-lg"
            >
              {t('description')}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="mb-12 flex flex-col items-center gap-4 sm:flex-row"
            >
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <GetStartedButton text={t('get-started')} href="/home" />
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <Link href="/challenges">
                  <Button
                    variant="outline"
                    className="group relative overflow-hidden"
                  >
                    <motion.span
                      className="absolute inset-0 bg-primary/10"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.5 }}
                    />
                    <span className="relative z-10 flex items-center">
                      {t('explore')}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Button>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* NEO League Section */}
        <section id="neo-league" className="w-full py-24">
          <div className="mx-auto max-w-6xl px-4">
            {/* Existing NEO League content */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="relative w-full overflow-hidden py-24"
            >
              <div className="relative mx-auto max-w-6xl px-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-center"
                >
                  <Badge
                    variant="outline"
                    className="mb-4 animate-pulse bg-background/50 text-primary backdrop-blur-sm"
                  >
                    <Trophy className="mr-2 h-4 w-4" />
                    {t('feature-event')}
                  </Badge>

                  <h2 className="mb-4 text-balance bg-linear-to-r from-primary via-dynamic-purple to-dynamic-blue bg-clip-text font-bold text-4xl text-transparent">
                    NEO League {t('season')} 1
                  </h2>

                  <div className="mb-6 bg-linear-to-r from-dynamic-purple to-dynamic-red bg-clip-text font-bold text-3xl text-transparent">
                    Prompt The Future
                  </div>
                </motion.div>

                {/* Replace existing timeline with AnimatedTimeline */}
                <AnimatedTimeline
                  events={[
                    {
                      date: t('time-line.open-cere-date'),
                      title: t('time-line.open-cere'),
                      type: t('time-line.virtual-badge'),
                      icon: <CalendarDays className="h-5 w-5" />,
                      description: t('time-line.open-cere-description'),
                    },
                    {
                      date: t('time-line.top-30-selection-date'),
                      title: t('time-line.top-30-selection'),
                      type: t('time-line.virtual-badge'),
                      icon: <Trophy className="h-5 w-5" />,
                      description: t('time-line.top-30-selection-description'),
                    },
                    {
                      date: t('time-line.top-15-selection-date'),
                      title: t('time-line.top-15-selection'),
                      type: t('time-line.virtual-badge'),
                      icon: <Star className="h-5 w-5" />,
                      description: t('time-line.top-15-selection-description'),
                    },
                    {
                      date: t('time-line.final-competition-date'),
                      title: t('time-line.final-competition'),
                      type: t('time-line.onsite-badge'),
                      icon: <Trophy className="h-5 w-5" />,
                      description: t('time-line.final-competition-description'),
                    },
                  ]}
                />

                <Separator className="my-12 bg-foreground/10" />

                {/* Enhanced Requirements and Info Cards */}
                <div className="mt-16 grid gap-6 md:grid-cols-2">
                  <motion.div
                    variants={cardVariants}
                    whileHover="hover"
                    className="group"
                  >
                    <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5">
                      <div className="relative overflow-hidden rounded-xl p-6">
                        <div className="relative">
                          <h3 className="mb-4 flex items-center gap-2 font-bold text-xl">
                            <UserCheck className="h-5 w-5 text-primary" />
                            {t('requirements')}
                          </h3>
                          <ul className="space-y-3">
                            <li className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span>{t('based-in')}</span>
                            </li>
                            <li className="flex items-center gap-2 text-muted-foreground">
                              <School className="h-4 w-4" />
                              <span>{t('undergraduates')}</span>
                            </li>
                            <li className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>{t('age')}</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  <motion.div
                    variants={cardVariants}
                    whileHover="hover"
                    className="group"
                  >
                    <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5">
                      <div className="relative overflow-hidden rounded-xl p-6">
                        <div className="relative">
                          <h3 className="mb-4 flex items-center gap-2 font-bold text-xl">
                            <Target className="h-5 w-5 text-primary" />
                            {t('program-objectives')}
                          </h3>
                          <ul className="space-y-3">
                            {[
                              t('program-objectives-description-1'),
                              t('program-objectives-description-2'),
                              t('program-objectives-description-3'),
                              t('program-objectives-description-4'),
                              t('program-objectives-description-5'),
                            ].map((objective) => (
                              <li
                                key={objective}
                                className="flex items-start gap-2 text-muted-foreground"
                              >
                                <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-primary" />
                                <span>{objective}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <motion.div
                    className="mt-12 text-center"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href="">
                            <Button disabled={true} size="lg">
                              <span className="relative z-10 flex items-center gap-2">
                                {t('register')}
                                <RocketIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                              </span>
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Closed</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </motion.div>
                  <motion.div
                    className="mt-12 text-center"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Link href="/competitions/neo-league/prompt-the-future/about">
                      <Button size="lg" variant="outline">
                        <span className="relative z-10 flex items-center gap-2">
                          {t('learn_more')}
                          <RocketIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </Button>
                    </Link>
                  </motion.div>
                </div>
              </div>
            </motion.section>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-16 text-center">
              <Badge variant="outline" className="mb-4">
                {t('feature')}
              </Badge>
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                {t('feature-title')}
              </h2>
              <p className="text-muted-foreground">
                {t('feature-title-description')}
              </p>
            </div>

            <FeatureShowcase />
          </div>
        </section>

        {/* Learning Section with enhanced visuals */}
        <section id="learning" className="relative w-full py-24">
          <div className="absolute inset-0 bg-primary/5" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />

          <div className="relative mx-auto max-w-6xl px-4">
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <Badge variant="outline"> {t('learning-resources')}</Badge>
                <h2 className="font-bold text-3xl md:text-4xl">
                  {t('learning-subtitle')}
                </h2>
                <p className="text-foreground/60">
                  {t('learning-subtitle-description')}
                </p>
                <div className="space-y-4">
                  {[
                    t('learning-tututorials'),
                    t('real-world'),
                    t('expert-lead'),
                    t('community'),
                  ].map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="rounded-full bg-primary/10 p-1 text-primary">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <span>{item}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="relative aspect-video rounded-xl border bg-background/30 backdrop-blur-sm">
                  <div className="absolute inset-0 rounded-xl bg-linear-to-br from-primary/10 via-transparent to-transparent" />
                  <div className="relative p-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="grid gap-4"
                    >
                      {[
                        {
                          icon: <GraduationCap className="h-5 w-5" />,
                          title: t('structure-learning'),
                          description: t('structure-learning-description'),
                        },
                        {
                          icon: <Users className="h-5 w-5" />,
                          title: t('community-support'),
                          description: t('community-support-description'),
                        },
                        {
                          icon: <Trophy className="h-5 w-5" />,
                          title: t('earn-cert'),
                          description: t('earn-cert-description'),
                        },
                      ].map((item, index) => (
                        <motion.div
                          key={item.title}
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-start gap-4 rounded-lg border bg-background/10 p-4 backdrop-blur-sm"
                        >
                          <div className="rounded-full bg-foreground/10 p-2 text-primary">
                            {item.icon}
                          </div>
                          <div>
                            <h3 className="font-semibold">{item.title}</h3>
                            <p className="text-muted-foreground text-sm">
                              {item.description}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Add AI Features section before the CTA */}
        <AiFeatures />

        {/* Enhanced CTA Section */}
        <section className="relative w-full py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative mx-auto max-w-4xl px-4 text-center"
          >
            <Badge variant="outline" className="mb-4">
              <Sparkles className="mr-2 h-4 w-4" />
              {t('get-started-today')}
            </Badge>
            <h2 className="mb-4 font-bold text-4xl md:text-5xl">
              {t('get-started-today-subtitle')}
            </h2>
            <p className="mb-8 text-muted-foreground">
              {t('get-started-today-description')}
            </p>
            <motion.div
              className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <GetStartedButton text={t('get-started')} href="/home" />
              <Link
                target="_blank"
                href={
                  DEV_MODE
                    ? 'http://localhost:3000/prompt-engineering/introduction'
                    : 'https://docs.tuturuuu.com/prompt-engineering/introduction'
                }
              >
                <Button variant="outline" className="group">
                  {/* Browse Learning Resources */}
                  {t('browse-learning-resources')}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </section>
      </div>
    </>
  );
}
