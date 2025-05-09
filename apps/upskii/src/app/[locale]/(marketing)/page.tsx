'use client';

import GradientHeadline from '../gradient-headline';
import AiFeatures from './ai-features';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  GraduationCap,
  MessageSquare,
  RocketIcon,
  School,
  Sparkles,
  Users,
  Video,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { type Variants, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MarketingPage() {
  const t = useTranslations('boarding-pages.home');
  // Fetch workspaces from the API
  const [wsId, setWsId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWsId() {
      const workspaces = await getWorkspaces();
      setWsId(workspaces?.[0]?.id || null);
    }
    fetchWsId();
  }, []);
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
      {/* <HeroAnimation /> */}
      <div className="relative flex h-full min-h-screen w-full flex-col items-center will-change-transform">
        <section id="hero" className="relative w-full">
          <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 sm:py-32">
            {/* Hero content */}
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
                  className="bg-foreground/10 absolute inset-0 opacity-100 transition-opacity"
                  whileHover={{ opacity: 1 }}
                />
                <Sparkles className="mr-2 h-4 w-4" />
                <span className="relative z-10">{t('hero.badge')}</span>
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-foreground mb-6 text-balance text-center text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl"
            >
              {t('hero.title-1')}
              <br />
              <GradientHeadline title={t('hero.title-2')} />
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-foreground/50 mb-8 max-w-2xl text-balance text-center text-lg"
            >
              {t('hero.description')}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="mb-12 flex flex-col items-center gap-4 sm:flex-row"
            >
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <GetStartedButton
                  text={t('common.get-started')}
                  href={wsId ? `/${wsId}/home` : '/onboarding'}
                  disabled={!wsId && wsId !== null}
                />
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <Link href="/guide">
                  <Button
                    variant="outline"
                    className="group relative overflow-hidden"
                  >
                    <motion.span
                      className="bg-primary/10 absolute inset-0"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.5 }}
                    />
                    <span className="relative z-10 flex items-center">
                      {t('hero.platform-guide')}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Button>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Key Features Section */}
        <section id="features" className="w-full py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-16 text-center">
              <Badge variant="outline" className="mb-4">
                {t('key-features.badge')}
              </Badge>
              <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                {t('key-features.title')}
              </h2>
              <p className="text-muted-foreground">
                {t('key-features.description')}
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: <Video className="h-6 w-6" />,
                  title: t('key-features.feature-1.title'),
                  description: t('key-features.feature-1.description'),
                  gradient: 'from-blue-500/20 via-primary/20 to-indigo-500/20',
                },
                {
                  icon: <Brain className="h-6 w-6" />,
                  title: t('key-features.feature-2.title'),
                  description: t('key-features.feature-2.description'),
                  gradient: 'from-purple-500/20 via-primary/20 to-blue-500/20',
                },
                {
                  icon: <MessageSquare className="h-6 w-6" />,
                  title: t('key-features.feature-3.title'),
                  description: t('key-features.feature-3.description'),
                  gradient: 'from-emerald-500/20 via-primary/20 to-teal-500/20',
                },
                {
                  icon: <BookOpen className="h-6 w-6" />,
                  title: t('key-features.feature-4.title'),
                  description: t('key-features.feature-4.description'),
                  gradient: 'from-amber-500/20 via-primary/20 to-orange-500/20',
                },
                {
                  icon: <Users className="h-6 w-6" />,
                  title: t('key-features.feature-5.title'),
                  description: t('key-features.feature-5.description'),
                  gradient: 'from-pink-500/20 via-primary/20 to-rose-500/20',
                },
                {
                  icon: <School className="h-6 w-6" />,
                  title: t('key-features.feature-6.title'),
                  description: t('key-features.feature-6.description'),
                  gradient: 'from-cyan-500/20 via-primary/20 to-sky-500/20',
                },
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="group"
                >
                  <Card className="border-primary/10 bg-foreground/10 relative h-full overflow-hidden">
                    <div className="relative z-10 flex h-full flex-col space-y-4 p-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/10 text-primary rounded-full p-3">
                          {feature.icon}
                        </div>
                      </div>
                      <h3 className="text-xl font-bold">{feature.title}</h3>
                      <p className="text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>

                    {/* Animated gradient background */}
                    <motion.div
                      className={`absolute inset-0 -z-10 bg-gradient-to-br ${feature.gradient} opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100`}
                      animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 5, 0],
                      }}
                      transition={{
                        duration: 5,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* For Teachers Section */}
        <section id="for-teachers" className="relative w-full py-24">
          <div className="bg-primary/5 absolute inset-0" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />

          <div className="relative mx-auto max-w-6xl px-4">
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <Badge variant="outline">{t('for-teachers.badge')}</Badge>
                <h2 className="text-3xl font-bold md:text-4xl">
                  {t('for-teachers.title')}
                </h2>
                <p className="text-foreground/60">
                  {t('for-teachers.description')}
                </p>
                <div className="space-y-4">
                  {[
                    t('for-teachers.details-1'),
                    t('for-teachers.details-2'),
                    t('for-teachers.details-3'),
                    t('for-teachers.details-4'),
                    t('for-teachers.details-5'),
                  ].map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="bg-primary/10 text-primary rounded-full p-1">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <span>{item}</span>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link href="/guide#for-teachers">
                    <Button className="mt-4">
                      <span className="relative z-10 flex items-center gap-2">
                        {t('for-teachers.button')}
                        <RocketIcon className="h-4 w-4" />
                      </span>
                    </Button>
                  </Link>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="bg-background/30 relative aspect-video rounded-xl border backdrop-blur-sm">
                  <div className="from-primary/10 absolute inset-0 rounded-xl bg-gradient-to-br via-transparent to-transparent" />
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
                          title: t('for-teachers.feature-1.title'),
                          description: t('for-teachers.feature-1.description'),
                        },
                        {
                          icon: <Users className="h-5 w-5" />,
                          title: t('for-teachers.feature-2.title'),
                          description: t('for-teachers.feature-2.description'),
                        },
                        {
                          icon: <Brain className="h-5 w-5" />,
                          title: t('for-teachers.feature-3.title'),
                          description: t('for-teachers.feature-3.description'),
                        },
                      ].map((item, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.1 }}
                          className="bg-background/10 flex items-start gap-4 rounded-lg border p-4 backdrop-blur-sm"
                        >
                          <div className="bg-foreground/10 text-primary rounded-full p-2">
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

        {/* For Students Section */}
        <section id="for-students" className="w-full py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="order-1 space-y-6 md:order-2"
              >
                <Badge variant="outline">
                  {t('for-students.badge')}
                </Badge>
                <h2 className="text-3xl font-bold md:text-4xl">
                  {t('for-students.title')}
                </h2>
                <p className="text-foreground/60">
                  {t('for-students.description')}
                </p>
                <div className="space-y-4">
                  {[
                    t('for-students.details-1'),
                    t('for-students.details-2'),
                    t('for-students.details-3'),
                    t('for-students.details-4'),
                    t('for-students.details-5'),
                  ].map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="bg-primary/10 text-primary rounded-full p-1">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <span>{item}</span>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link href="/guide#for-students">
                    <Button className="mt-4">
                      <span className="relative z-10 flex items-center gap-2">
                        {t('for-students.button')}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Button>
                  </Link>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative order-2 md:order-1"
              >
                <Card className="border-foreground/10 bg-foreground/5 overflow-hidden">
                  <div className="space-y-4 p-6">
                    <h3 className="text-xl font-bold">
                      {t('for-students.course-categories.title')}
                    </h3>
                    <Separator className="bg-foreground/10" />
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        t('for-students.course-categories.category-1'),
                        t('for-students.course-categories.category-2'),
                        t('for-students.course-categories.category-3'),
                        t('for-students.course-categories.category-4'),
                        t('for-students.course-categories.category-5'),
                        t('for-students.course-categories.category-6'),
                      ].map((category, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-foreground/10 hover:border-primary/20 rounded-lg border border-transparent p-3 text-sm transition-colors"
                        >
                          {category}
                        </motion.div>
                      ))}
                    </div>
                    <Separator className="bg-foreground/10" />
                    <p className="text-muted-foreground text-sm">
                      {t('for-students.course-categories.footer')}
                    </p>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* AI Features Section */}
        <AiFeatures />

        {/* Multilingual Support Section */}
        <section className="relative w-full py-24">
          <div className="bg-primary/5 absolute inset-0" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />

          <div className="relative mx-auto max-w-6xl px-4">
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <Badge variant="outline">
                  {t('multilingual-support.badge')}
                </Badge>
                <h2 className="text-3xl font-bold md:text-4xl">
                  {t('multilingual-support.title')}
                </h2>
                <p className="text-foreground/60">
                  {t('multilingual-support.description')}
                </p>
                <div className="space-y-4">
                  {[
                    t('multilingual-support.details-1'),
                    t('multilingual-support.details-2'),
                    t('multilingual-support.details-3'),
                    t('multilingual-support.details-4'),
                  ].map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="bg-primary/10 text-primary rounded-full p-1">
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
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-foreground/10 bg-foreground/5 p-6">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="mb-2 text-xl font-bold">English</h3>
                      <p className="text-muted-foreground mb-4 text-sm">
                        Access our full platform and all courses in English
                      </p>
                      <div className="text-4xl font-bold">EN</div>
                    </div>
                  </Card>
                  <Card className="border-foreground/10 bg-foreground/5 p-6">
                    <div className="flex flex-col items-center text-center">
                      <h3 className="mb-2 text-xl font-bold">Tiếng Việt</h3>
                      <p className="text-muted-foreground mb-4 text-sm">
                        Truy cập nền tảng và các khóa học bằng tiếng Việt
                      </p>
                      <div className="text-4xl font-bold">VI</div>
                    </div>
                  </Card>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

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
              {t('cta-section.badge')}
            </Badge>
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              {t('cta-section.title')}
            </h2>
            <p className="text-muted-foreground mb-8">
              {t('cta-section.description')}
            </p>
            <motion.div
              className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <GetStartedButton
                text={t('common.get-started')}
                href={wsId ? `/${wsId}/home` : '/login'}
                disabled={!wsId && wsId !== null}
              />
              <Link href="/about">
                <Button variant="outline" className="group">
                  {t('cta-section.button')}
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

async function getWorkspaces() {
  const response = await fetch('/api/v1/workspaces');
  if (!response.ok) notFound();

  const data = await response.json();
  console.log('Hello', data);
  return data as Workspace[];
}
