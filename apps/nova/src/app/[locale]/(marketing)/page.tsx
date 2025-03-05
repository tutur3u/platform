'use client';

import GradientHeadline from '../gradient-headline';
import AiFeatures from './ai-features';
import AnimatedTimeline from './animated-timeline';
import FeatureShowcase from './feature-showcase';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { Separator } from '@tuturuuu/ui/separator';
import { type Variants, motion } from 'framer-motion';
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
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';

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
  };

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
  };

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
  } as Variants;

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
                <span className="relative z-10">
                  {t('badge')}
                </span>
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mb-6 text-center text-4xl font-bold tracking-tight text-balance text-foreground md:text-6xl lg:text-7xl"
            >
              {t('title')}
              <br />
              <GradientHeadline title="Prompt Engineering" />
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="mb-8 max-w-2xl text-center text-lg text-balance text-foreground/50"
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
                <GetStartedButton text={t('get-started')} />
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
                    Featured Event
                  </Badge>

                  <h2 className="mb-4 bg-gradient-to-r from-primary via-dynamic-purple to-dynamic-blue bg-clip-text text-4xl font-bold text-balance text-transparent">
                    NEO League {t('season')} 1
                  </h2>

                  <div className="mb-6 bg-gradient-to-r from-dynamic-purple to-dynamic-red bg-clip-text text-3xl font-bold text-transparent">
                    Prompt The Future
                  </div>
                </motion.div>

                {/* Replace existing timeline with AnimatedTimeline */}
                <AnimatedTimeline
                  events={[
                    {
                      date: '05 April 2025',
                      title: t('open-cere'),
                      type: 'Virtual',
                      icon: <CalendarDays className="h-5 w-5" />,
                      description:
                        t('open-cere-description'),
                    },
                    {
                      date: '12 April 2025',
                      title: t('top-50-selection'),
                      type: 'Virtual',
                      icon: <Trophy className="h-5 w-5" />,
                      description:
                      t('top-50-selection-description'),
                    },
                    {
                      date: '19 April 2025',
                      title: t('top-30-selection'),
                      type: 'Virtual',
                      icon: <Star className="h-5 w-5" />,
                      description: t('top-30-selection-description'),
                    },
                    {
                      date: '26 April 2025',
                      title: t('final-competition'),
                      type: 'On-site',
                      icon: <Trophy className="h-5 w-5" />,
                      description: t('final-competition-description'),
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
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
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
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
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
                            ].map((objective, index) => (
                              <li
                                key={index}
                                className="flex items-start gap-2 text-muted-foreground"
                              >
                                <CheckCircle className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
                                <span>{objective}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                </div>

                {/* Enhanced CTA Button */}
                <motion.div
                  className="mt-12 text-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button size="lg" disabled>
                    <span className="relative z-10 flex items-center gap-2">
                      {t('register')}
                      <RocketIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Button>
                </motion.div>
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
              <h2 className="mb-4 text-3xl font-bold md:text-4xl">
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
                <h2 className="text-3xl font-bold md:text-4xl">
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
                      key={index}
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
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
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
                          title: t("structure-learning"),
                          description:
                            t('structure-learning-description'),
                        },
                        {
                          icon: <Users className="h-5 w-5" />,
                          title: t("community-support"),
                          description:
                            t('community-support-description'),
                        },
                        {
                          icon: <Trophy className="h-5 w-5" />,
                          title: t('earn-cert'),
                          description: t('earn-cert-description'),
                        },
                      ].map((item, index) => (
                        <motion.div
                          key={index}
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
                            <p className="text-sm text-muted-foreground">
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
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
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
              <GetStartedButton text={t('get-started')} />
              <Link href="/learn">
                <Button variant="outline" className="group">
                  Browse Learning Resources
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
