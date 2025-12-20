'use client';

import {
  ArrowRight,
  Award,
  Calendar,
  Code2,
  Eye,
  Globe,
  GraduationCap,
  Heart,
  Lightbulb,
  Palette,
  Rocket,
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
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { cn } from '@tuturuuu/utils/format';
import { motion, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

// Language Switcher Component
function LanguageSwitcher({
  locale: currentLocale,
  className,
}: {
  locale: string;
  className?: string;
  reduceEffects?: boolean;
}) {
  const t = useTranslations('vietnameseWomensDay');
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const isVietnamese = currentLocale === 'vi';

  const switchLocale = async () => {
    setLoading(true);

    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'POST',
      body: JSON.stringify({ locale: isVietnamese ? 'en' : 'vi' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) router.refresh();
  };

  return (
    <div className={cn('flex flex-col items-end gap-2', className)}>
      <div
        className={cn(
          'rounded-lg border border-border/50 bg-background/80 px-3 py-1.5 text-muted-foreground text-xs'
        )}
      >
        {t('languageAvailable')}
      </div>
      <Button
        onClick={switchLocale}
        variant="outline"
        size="sm"
        disabled={loading}
        className={cn(
          'group gap-2 border-dynamic-pink/30 bg-background/80 font-semibold transition-all hover:border-dynamic-pink/50 hover:bg-dynamic-pink/10'
        )}
      >
        <Globe className="h-4 w-4 transition-transform group-hover:rotate-12" />
        {loading ? (
          <LoadingIndicator />
        ) : isVietnamese ? (
          'Read in English'
        ) : (
          'Đọc bằng tiếng Việt'
        )}
      </Button>
    </div>
  );
}

// Animated counter component - optimized for mobile performance
function AnimatedCounter({ value }: { value: string }) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (hasAnimated) return;

    const targetValue = Number.parseFloat(value);
    if (Number.isNaN(targetValue)) return;

    let start = 0;
    const duration = 2000;
    const increment = targetValue / (duration / 16);
    let animationFrame: number;

    const animate = () => {
      start += increment;
      if (start >= targetValue) {
        setCount(targetValue);
        setHasAnimated(true);
      } else {
        setCount(start);
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [hasAnimated, value]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      onViewportEnter={() => setHasAnimated(true)}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.3 }}
    >
      {value.includes('%')
        ? `${Math.round(count)}%`
        : value.includes('x')
          ? `${count.toFixed(1)}x`
          : value}
    </motion.div>
  );
}

export default function VietnameseWomensDayPage() {
  const t = useTranslations('vietnameseWomensDay');
  const locale = useLocale();

  // Detect mobile and reduced motion preference for performance optimization
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => setIsMobile(window.innerWidth < 768);

    // Check reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    checkMobile();
    window.addEventListener('resize', checkMobile);

    const handleChange = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Disable expensive scroll animations on mobile for better performance
  const { scrollYProgress } = useScroll();

  const heroY = useTransform(
    scrollYProgress,
    [0, 0.2],
    isMobile || prefersReducedMotion ? [0, 0] : [0, -50]
  );

  // Simplified animation variants for better mobile performance
  // Memoized to prevent recreation on every render
  const shouldReduceMotion = isMobile || prefersReducedMotion;

  const fadeInUpVariant = useMemo(
    () =>
      (delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          y: shouldReduceMotion ? 0 : 20,
        },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );
  const fadeInViewVariant = useMemo(
    () =>
      (delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          y: shouldReduceMotion ? 0 : 30,
        },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: shouldReduceMotion ? '0px' : '-50px' },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );

  // Image slide animation variant - prevents blinking after animation
  const imageSlideVariant = useMemo(
    () =>
      (direction: 'left' | 'right', delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          x: shouldReduceMotion ? 0 : direction === 'left' ? -40 : 40,
        },
        whileInView: { opacity: 1, x: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Simplified Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-1/4 h-[40rem] w-[40rem] rounded-full bg-linear-to-br from-dynamic-pink/20 via-dynamic-purple/10 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-1/4 h-[40rem] w-[40rem] rounded-full bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,182,193,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* Language Switcher */}
      <motion.div
        {...fadeInUpVariant(0.3)}
        className="relative mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-4 lg:px-8 lg:pt-8"
      >
        <LanguageSwitcher locale={locale} reduceEffects={shouldReduceMotion} />
      </motion.div>

      {/* Hero Section */}
      <motion.section
        style={{ y: heroY }}
        className="relative px-4 pt-8 pb-20 sm:px-6 sm:pt-12 sm:pb-24 lg:px-8 lg:pt-16 lg:pb-32"
      >
        <div className="mx-auto max-w-7xl text-center">
          <motion.div {...fadeInUpVariant(0)}>
            <Badge
              variant="secondary"
              className={cn(
                'mb-6 border-dynamic-pink/30 bg-dynamic-pink/10 px-6 py-2 text-xs md:text-sm'
              )}
            >
              <Heart className="mr-2 h-4 w-4 text-dynamic-pink" />
              {t('hero.badge')}
            </Badge>
          </motion.div>

          <motion.h1
            {...fadeInUpVariant(0.1)}
            className="mb-12 font-bold text-3xl tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
          >
            {t('hero.title.part1')}{' '}
            <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-red bg-clip-text text-transparent">
              {t('hero.title.highlight')}
            </span>
            <br />
            {t('hero.title.part2')}
          </motion.h1>

          <motion.p
            {...fadeInUpVariant(0.2)}
            className="mx-auto mb-10 max-w-3xl text-foreground/80 text-lg sm:text-xl md:text-2xl"
          >
            {t('hero.description')}
          </motion.p>

          <motion.div
            {...fadeInUpVariant(0.3)}
            className="flex flex-col flex-wrap items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              className="group relative overflow-hidden bg-linear-to-r from-dynamic-cyan to-dynamic-purple px-8 py-6 shadow-lg transition-all hover:shadow-xl sm:w-auto"
              asChild
            >
              <Link href="/careers">
                <Zap className="mr-2 h-5 w-5" />
                {t('hero.cta.joinUs')}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-2 border-dynamic-pink/30 px-8 py-6 transition-all hover:border-dynamic-pink/50 hover:bg-dynamic-pink/5 sm:w-auto"
              asChild
            >
              <Link href="/about">
                <Heart className="mr-2 h-5 w-5" />
                {t('hero.cta.learnMore')}
              </Link>
            </Button>
          </motion.div>
        </div>
      </motion.section>

      {/* Decorative Divider */}
      <div className="relative mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-dynamic-pink/30 to-transparent" />
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-pink/50" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-purple/50 delay-150" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue/50 delay-300" />
          </div>
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-dynamic-purple/30 to-transparent" />
        </div>
      </div>

      {/* Inspirational Quote Section */}
      <section className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="relative">
            <Card
              className={cn(
                'relative border-2 border-dynamic-purple/20 bg-dynamic-purple/10 p-12 text-center md:p-16'
              )}
            >
              {/* Quote Icon */}
              <div className="absolute top-8 left-8 opacity-10">
                <Sparkles className="h-24 w-24 text-dynamic-pink" />
              </div>
              <div className="absolute right-8 bottom-8 rotate-180 opacity-10">
                <Sparkles className="h-24 w-24 text-dynamic-purple" />
              </div>

              {/* Quote Content */}
              <div className="relative">
                <div className="mb-6 text-6xl text-dynamic-pink/40">"</div>

                <p className="mb-6 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-pink bg-clip-text pb-4 font-bold text-2xl text-transparent sm:text-3xl md:text-4xl">
                  {t('quote.text')}
                </p>

                <div className="flex items-center justify-center gap-2 text-foreground/60">
                  <div className="h-px w-8 bg-linear-to-r from-transparent to-dynamic-purple/50" />
                  <span className="font-medium text-sm">
                    {t('quote.author')}
                  </span>
                  <div className="h-px w-8 bg-linear-to-l from-transparent to-dynamic-pink/50" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Women in Leadership Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('womenInLeadership.title')}
            </h2>
            <p className="mx-auto max-w-3xl text-foreground/70 text-lg">
              {t('womenInLeadership.subtitle')}
            </p>
          </motion.div>

          <div className="space-y-20">
            {/* Executive Leadership */}
            <div className="grid gap-8 text-center md:grid-cols-2 md:items-center md:text-balance">
              <div className="group relative overflow-hidden rounded-2xl border-2 border-dynamic-purple/30 shadow-xl transition-all hover:border-dynamic-purple/50 hover:shadow-2xl">
                <div className="relative aspect-[4/3] bg-dynamic-purple/5">
                  <Image
                    src="/media/marketing/events/women-in-tech/first-women-coo-with-first-women-people-and-operations-coordinator.jpeg"
                    alt={t('womenInLeadership.executives.name')}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    loading="eager"
                    priority
                  />
                </div>
              </div>
              <div>
                <div className="mb-4 inline-block rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-purple text-sm">
                    {t('womenInLeadership.executives.title')}
                  </span>
                </div>
                <h3 className="mb-2 font-bold text-3xl">
                  {t('womenInLeadership.executives.name')}
                </h3>
                <p className="mb-4 text-foreground/60 text-sm">
                  {t('womenInLeadership.executives.roles')}
                </p>
                <p className="text-balance text-foreground/80">
                  {t('womenInLeadership.executives.story')}
                </p>
              </div>
            </div>

            {/* Engineering Excellence */}
            <div className="grid gap-8 text-center md:grid-cols-2 md:items-center md:text-balance">
              <div className="order-2 md:order-1">
                <div className="mb-4 inline-block rounded-full border border-dynamic-pink/20 bg-dynamic-pink/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-pink text-sm">
                    {t('womenInLeadership.engineering.title')}
                  </span>
                </div>
                <h3 className="mb-2 font-bold text-3xl">
                  {t('womenInLeadership.engineering.name')}
                </h3>
                <p className="mb-4 text-foreground/60 text-sm">
                  {t('womenInLeadership.engineering.roles')}
                </p>
                <p className="text-balance text-foreground/80">
                  {t('womenInLeadership.engineering.story')}
                </p>
              </div>
              <div className="group relative order-1 overflow-hidden rounded-2xl border-2 border-dynamic-pink/30 shadow-xl transition-all hover:border-dynamic-pink/50 hover:shadow-2xl md:order-2">
                <div className="relative aspect-[4/3] bg-dynamic-pink/5">
                  <Image
                    src="/media/marketing/events/women-in-tech/anh-thu-first-women-contributor.jpg"
                    alt={t('womenInLeadership.engineering.name')}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    loading="eager"
                    priority
                  />
                </div>
              </div>
            </div>

            {/* Next-Generation Marketing */}
            <div className="grid gap-8 text-center md:grid-cols-2 md:items-center md:text-balance">
              <div className="group relative overflow-hidden rounded-2xl border-2 border-dynamic-blue/30 shadow-xl transition-all hover:border-dynamic-blue/50 hover:shadow-2xl">
                <div className="relative aspect-[4/3] bg-dynamic-blue/5">
                  <Image
                    src="/media/marketing/events/women-in-tech/next-generation-of-women-marketing-leader.jpg"
                    alt={t('womenInLeadership.marketing.name')}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    loading="eager"
                    priority
                  />
                </div>
              </div>
              <div>
                <div className="mb-4 inline-block rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-blue text-sm">
                    {t('womenInLeadership.marketing.title')}
                  </span>
                </div>
                <h3 className="mb-2 font-bold text-3xl">
                  {t('womenInLeadership.marketing.name')}
                </h3>
                <p className="mb-4 text-foreground/60 text-sm">
                  {t('womenInLeadership.marketing.roles')}
                </p>
                <p className="text-balance text-foreground/80">
                  {t('womenInLeadership.marketing.story')}
                </p>
              </div>
            </div>

            {/* Breaking Boundaries - Remote */}
            <div className="grid gap-8 text-center md:grid-cols-2 md:items-center md:text-balance">
              <div className="order-2 md:order-1">
                <div className="mb-4 inline-block rounded-full border border-dynamic-green/20 bg-dynamic-green/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-green text-sm">
                    {t('womenInLeadership.remote.title')}
                  </span>
                </div>
                <h3 className="mb-2 font-bold text-3xl">
                  {t('womenInLeadership.remote.name')}
                </h3>
                <p className="mb-4 text-foreground/60 text-sm">
                  {t('womenInLeadership.remote.roles')}
                </p>
                <p className="text-balance text-foreground/80">
                  {t('womenInLeadership.remote.story')}
                </p>
              </div>
              <div className="group relative order-1 overflow-hidden rounded-2xl border-2 border-dynamic-green/30 shadow-xl transition-all hover:border-dynamic-green/50 hover:shadow-2xl md:order-2">
                <div className="relative aspect-[4/3] bg-dynamic-green/5">
                  <Image
                    src="/media/marketing/events/women-in-tech/linh-dan-first-remote-women-software-engineer-intern.jpeg"
                    alt={t('womenInLeadership.remote.name')}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    loading="eager"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Stats Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl lg:text-6xl">
              {t('impact.title.part1')}{' '}
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                {t('impact.title.highlight')}
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('impact.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Lightbulb,
                titleKey: 'impact.stats.innovation.title',
                subtitleKey: 'impact.stats.innovation.subtitle',
                descriptionKey: 'impact.stats.innovation.description',
                color:
                  'border-dynamic-yellow/30 bg-dynamic-yellow/10 hover:border-dynamic-yellow/50',
                gradient: 'from-dynamic-yellow to-dynamic-orange',
              },
              {
                icon: Target,
                titleKey: 'impact.stats.leadership.title',
                subtitleKey: 'impact.stats.leadership.subtitle',
                descriptionKey: 'impact.stats.leadership.description',
                color:
                  'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
                gradient: 'from-dynamic-purple to-dynamic-pink',
              },
              {
                icon: Zap,
                titleKey: 'impact.stats.growth.title',
                subtitleKey: 'impact.stats.growth.subtitle',
                descriptionKey: 'impact.stats.growth.description',
                color:
                  'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
                gradient: 'from-dynamic-blue to-dynamic-cyan',
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <Card
                  className={cn(
                    'group h-full p-8 text-center transition-all hover:-translate-y-2 hover:shadow-lg',
                    stat.color
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                      `bg-linear-to-br ${stat.gradient}`
                    )}
                  >
                    <stat.icon className="h-8 w-8 text-white" />
                  </div>

                  <div
                    className={cn(
                      'mb-3 font-bold text-5xl',
                      `bg-linear-to-r ${stat.gradient} bg-clip-text text-transparent`
                    )}
                  >
                    <AnimatedCounter value={t(stat.titleKey as any)} />
                  </div>

                  <div className="mb-3 font-semibold text-foreground/90 text-sm uppercase tracking-wide">
                    {t(stat.subtitleKey as any)}
                  </div>

                  <div
                    className={cn(
                      'mx-auto mb-4 h-1 w-16 rounded-full',
                      `bg-linear-to-r ${stat.gradient}`
                    )}
                  />

                  <p className="text-foreground/70 text-sm">
                    {t(stat.descriptionKey as any)}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="relative px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('values.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('values.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Star,
                titleKey: 'values.items.excellence.title',
                descriptionKey: 'values.items.excellence.description',
                color:
                  'border-dynamic-yellow/30 bg-dynamic-yellow/10 hover:border-dynamic-yellow/50',
              },
              {
                icon: Lightbulb,
                titleKey: 'values.items.innovation.title',
                descriptionKey: 'values.items.innovation.description',
                color:
                  'border-dynamic-orange/30 bg-dynamic-orange/10 hover:border-dynamic-orange/50',
              },
              {
                icon: Users,
                titleKey: 'values.items.collaboration.title',
                descriptionKey: 'values.items.collaboration.description',
                color:
                  'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
              },
              {
                icon: GraduationCap,
                titleKey: 'values.items.growth.title',
                descriptionKey: 'values.items.growth.description',
                color:
                  'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
              },
              {
                icon: Heart,
                titleKey: 'values.items.inclusion.title',
                descriptionKey: 'values.items.inclusion.description',
                color:
                  'border-dynamic-pink/30 bg-dynamic-pink/10 hover:border-dynamic-pink/50',
              },
              {
                icon: Code2,
                titleKey: 'values.items.excellence-tech.title',
                descriptionKey: 'values.items.excellence-tech.description',
                color:
                  'border-dynamic-green/30 bg-dynamic-green/10 hover:border-dynamic-green/50',
              },
            ].map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05, duration: 0.5 }}
              >
                <Card
                  className={cn(
                    'flex h-full flex-col items-center justify-center p-6 transition-all hover:-translate-y-1 hover:shadow-md',
                    value.color
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
                      `bg-dynamic-${value.color}/10`
                    )}
                  >
                    <value.icon
                      className={cn('h-6 w-6', `text-dynamic-${value.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-bold text-lg">
                    {t(value.titleKey as any)}
                  </h3>
                  <p className="text-foreground/70 text-sm">
                    {t(value.descriptionKey as any)}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CEO Message Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-6xl">
          <div>
            <Card
              className={cn(
                'overflow-hidden border border-dynamic-purple/20 bg-dynamic-purple/10 p-8 shadow-xl md:p-12'
              )}
            >
              <div className="flex flex-col gap-8 md:flex-row md:items-start">
                {/* CEO Image */}
                <div className="flex shrink-0 flex-col items-center gap-4">
                  <div className="group relative h-64 w-64 overflow-hidden rounded-2xl border-2 border-dynamic-purple/30 bg-dynamic-purple/5 shadow-xl transition-all hover:border-dynamic-purple/50 hover:shadow-2xl">
                    <Image
                      src="/media/marketing/events/women-in-tech/founder.jpg"
                      alt={t('ceo.name')}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      priority
                    />
                  </div>

                  <div className="text-center">
                    <div className="mb-1 font-bold text-xl">
                      {t('ceo.name')}
                    </div>
                    <div className="text-dynamic-purple text-sm">
                      {t('ceo.title')}
                    </div>
                    <div className="text-foreground/60 text-xs">
                      {t('ceo.company')}
                    </div>
                  </div>
                </div>

                {/* CEO Message */}
                <div className="flex-1">
                  <div className="mb-6 flex flex-col items-center gap-3 md:flex-row">
                    <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dynamic-purple/10">
                      <Sparkles className="h-6 w-6 text-dynamic-purple" />
                    </div>
                    <h2 className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text pb-4 text-center font-bold text-transparent text-xl md:text-balance md:text-start md:text-3xl">
                      {t('ceo.messageTitle')}
                    </h2>
                  </div>

                  <div className="space-y-4 text-foreground/80">
                    {(
                      [
                        'paragraph1',
                        'paragraph2',
                        'paragraph3',
                        'paragraph4',
                      ] as const
                    ).map((key) => (
                      <p key={key}>{t(`ceo.message.${key}` as any)}</p>
                    ))}
                  </div>

                  <div className="mt-6 rounded-lg border-dynamic-purple/20 border-l-4 bg-dynamic-purple/5 p-4">
                    <p className="text-foreground/90 text-sm italic">
                      {t('ceo.message.closing')}
                    </p>
                    <p className="mt-2 font-semibold text-foreground">
                      {t('ceo.name')}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Decorative Divider */}
      <div className="relative mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center justify-center gap-4">
          <Heart className="h-5 w-5 text-dynamic-pink/40" />
          <div className="h-px w-32 bg-linear-to-r from-dynamic-pink/30 to-dynamic-purple/30" />
          <Sparkles className="h-5 w-5 text-dynamic-purple/40" />
          <div className="h-px w-32 bg-linear-to-r from-dynamic-purple/30 to-dynamic-blue/30" />
          <Star className="h-5 w-5 text-dynamic-blue/40" />
        </div>
      </div>

      {/* Achievements Timeline Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('achievements.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('achievements.subtitle')}
            </p>
          </motion.div>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute top-0 left-1/2 hidden h-full w-px -translate-x-1/2 bg-linear-to-b from-dynamic-pink via-dynamic-purple to-dynamic-blue lg:block" />

            <div className="space-y-12">
              {[
                {
                  key: 'founding',
                  icon: Calendar,
                  color:
                    'border-dynamic-pink/30 bg-dynamic-pink/10 hover:border-dynamic-pink/50',
                  gradient: 'from-dynamic-pink to-dynamic-red',
                },
                {
                  key: 'growth',
                  icon: TrendingUp,
                  color:
                    'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
                  gradient: 'from-dynamic-purple to-dynamic-pink',
                },
                {
                  key: 'mentorship',
                  icon: Users,
                  color:
                    'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
                  gradient: 'from-dynamic-blue to-dynamic-purple',
                },
                {
                  key: 'community',
                  icon: Award,
                  color:
                    'border-dynamic-green/30 bg-dynamic-green/10 hover:border-dynamic-green/50',
                  gradient: 'from-dynamic-green to-dynamic-blue',
                },
              ].map((achievement, index) => (
                <motion.div
                  key={achievement.key}
                  {...imageSlideVariant(
                    index % 2 === 0 ? 'left' : 'right',
                    index * 0.1
                  )}
                  className={cn(
                    'relative grid gap-8 lg:grid-cols-2',
                    index % 2 === 0
                      ? 'text-center lg:text-right'
                      : 'text-center lg:flex-row-reverse lg:text-left'
                  )}
                >
                  {/* Content */}
                  <div
                    className={cn(
                      'lg:flex lg:flex-col',
                      index % 2 === 0
                        ? 'lg:items-end lg:pr-12'
                        : 'lg:col-start-2 lg:items-start lg:pl-12'
                    )}
                  >
                    <Card
                      className={cn(
                        'p-6 transition-all hover:-translate-y-1 hover:shadow-lg',
                        achievement.color
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-2',
                          index % 2 === 0
                            ? 'justify-center lg:justify-end'
                            : 'justify-center lg:justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl',
                            `bg-linear-to-br ${achievement.gradient}`
                          )}
                        >
                          <achievement.icon className="h-6 w-6 text-white" />
                        </div>

                        <div
                          className={cn(
                            'mb-3 inline-block font-bold text-3xl',
                            `bg-linear-to-r ${achievement.gradient} bg-clip-text text-transparent`
                          )}
                        >
                          {t(
                            `achievements.items.${achievement.key}.year` as any
                          )}
                        </div>
                      </div>

                      <h3 className="mb-2 font-bold text-xl">
                        {t(
                          `achievements.items.${achievement.key}.title` as any
                        )}
                      </h3>
                      <p className="text-foreground/70 text-sm">
                        {t(
                          `achievements.items.${achievement.key}.description` as any
                        )}
                      </p>
                    </Card>
                  </div>

                  {/* Timeline Dot */}
                  <div className="absolute top-6 left-1/2 hidden h-4 w-4 -translate-x-1/2 lg:block">
                    <div
                      className={cn(
                        'h-full w-full rounded-full',
                        `bg-linear-to-r ${achievement.gradient} shadow-lg`
                      )}
                    />
                    <div
                      className={cn(
                        'absolute inset-0 animate-ping rounded-full opacity-75',
                        `bg-linear-to-r ${achievement.gradient}`
                      )}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Global Impact Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('globalImpact.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('globalImpact.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                key: 'vietnam',
                gradient: 'from-dynamic-red to-dynamic-yellow',
                color:
                  'border-dynamic-red/30 bg-dynamic-red/10 hover:border-dynamic-red/50',
              },
              {
                key: 'global',
                gradient: 'from-dynamic-blue to-dynamic-purple',
                color:
                  'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
              },
              {
                key: 'future',
                gradient: 'from-dynamic-purple to-dynamic-pink',
                color:
                  'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
              },
            ].map((item, index) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
              >
                <Card
                  className={cn(
                    'group h-full p-8 text-center transition-all hover:-translate-y-2 hover:shadow-xl',
                    item.color
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-6 h-2 w-24 rounded-full',
                      `bg-linear-to-r ${item.gradient}`
                    )}
                  />

                  <h3
                    className={cn(
                      'mb-4 font-bold text-2xl',
                      `bg-linear-to-r ${item.gradient} bg-clip-text text-transparent`
                    )}
                  >
                    {t(`globalImpact.${item.key}.title` as any)}
                  </h3>

                  <p className="text-foreground/70">
                    {t(`globalImpact.${item.key}.description` as any)}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Images Showcase */}
          <div className="mt-16 grid gap-8 md:grid-cols-2">
            <div className="group relative overflow-hidden rounded-2xl border-2 border-dynamic-purple/30 shadow-xl transition-all hover:border-dynamic-purple/50 hover:shadow-2xl">
              <div className="relative aspect-video bg-dynamic-purple/5">
                <Image
                  src="/media/marketing/events/women-in-tech/experiences-with-women-in-tech-peers-from-vietnam-to-the-world.jpg"
                  alt="Women in Tech: Vietnam to the World"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  loading="eager"
                  priority
                />
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border-2 border-dynamic-pink/30 shadow-xl transition-all hover:border-dynamic-pink/50 hover:shadow-2xl">
              <div className="relative aspect-video bg-dynamic-pink/5">
                <Image
                  src="/media/marketing/events/women-in-tech/experiences-with-women-in-tech-peers-from-vietnam-to-the-world-2.jpg"
                  alt="Global Tech Collaboration"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  loading="eager"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('team.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('team.subtitle')}
            </p>
          </motion.div>

          <div>
            <Card className="group overflow-hidden border border-dynamic-pink/30 bg-dynamic-pink/10 p-0 shadow-xl transition-all hover:border-dynamic-pink/50 hover:shadow-2xl">
              <div className="relative aspect-video w-full overflow-hidden bg-dynamic-pink/5">
                <Image
                  src="/media/marketing/events/women-in-tech/team.jpg"
                  alt={t('team.imageTitle')}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                  loading="eager"
                  priority
                />
                <div className="absolute inset-0 bg-linear-to-t from-dynamic-pink/10 via-dynamic-pink/5 to-transparent" />
              </div>

              <div className="p-8 text-center">
                <h3 className="mb-3 bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-bold text-2xl text-transparent">
                  {t('team.imageTitle')}
                </h3>
                <p className="mx-auto max-w-2xl text-foreground/80">
                  {t('team.imageDescription')}
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Diversity Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('diversity.title')}
            </h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                key: 'perspective',
                icon: Eye,
                color:
                  'border-dynamic-pink/30 bg-dynamic-pink/10 hover:border-dynamic-pink/50',
                gradient: 'from-dynamic-pink to-dynamic-red',
              },
              {
                key: 'creativity',
                icon: Palette,
                color:
                  'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
                gradient: 'from-dynamic-purple to-dynamic-pink',
              },
              {
                key: 'market',
                icon: Globe,
                color:
                  'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
                gradient: 'from-dynamic-blue to-dynamic-cyan',
              },
            ].map((item, index) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
              >
                <Card
                  className={cn(
                    'group h-full p-8 transition-all hover:-translate-y-2 hover:shadow-xl',
                    item.color
                  )}
                >
                  {/* Icon */}
                  <div className="mb-6 flex justify-center">
                    <div
                      className={cn(
                        'flex h-20 w-20 items-center justify-center rounded-2xl transition-transform group-hover:scale-110',
                        `bg-linear-to-br ${item.gradient} shadow-lg`
                      )}
                    >
                      <item.icon className="h-10 w-10 text-white" />
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    className={cn(
                      'mb-4 text-center font-bold text-2xl',
                      `bg-linear-to-r ${item.gradient} bg-clip-text text-transparent`
                    )}
                  >
                    {t(`diversity.items.${item.key}.title` as any)}
                  </h3>

                  {/* Description */}
                  <p className="text-center text-foreground/70">
                    {t(`diversity.items.${item.key}.description` as any)}
                  </p>

                  {/* Decorative Element */}
                  <div className="mt-6 flex justify-center">
                    <div
                      className={cn(
                        'h-1 w-16 rounded-full transition-all group-hover:w-24',
                        `bg-linear-to-r ${item.gradient}`
                      )}
                    />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Male Colleagues Wishes Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className="mb-4 bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-purple bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('maleColleagues.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('maleColleagues.subtitle')}
            </p>
          </motion.div>

          {/* Group Photo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <Card className="group overflow-hidden border border-dynamic-blue/30 bg-dynamic-blue/10 p-0 shadow-xl transition-all hover:border-dynamic-blue/50 hover:shadow-2xl">
              <div className="relative aspect-video w-full overflow-hidden bg-dynamic-blue/5">
                <Image
                  src="/media/marketing/events/women-in-tech/tuturuuu-male-colleagues.jpg"
                  alt={t('maleColleagues.groupPhotoAlt')}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                  loading="eager"
                  priority
                />
                <div className="absolute inset-0 bg-linear-to-t from-dynamic-blue/10 via-dynamic-blue/5 to-transparent" />
              </div>
            </Card>
          </motion.div>

          {/* Individual Wishes */}
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-6">
            {[
              {
                key: 'phuc',
                image:
                  '/media/marketing/events/women-in-tech/phuc-founder-ceo-of-tuturuuu.jpg',
                gradient: 'from-dynamic-purple to-dynamic-pink',
                borderColor:
                  'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
                size: 'md:col-span-full lg:col-span-3',
              },
              {
                key: 'henry',
                image:
                  '/media/marketing/events/women-in-tech/henry-coo-of-tuturuuu.jpg',
                gradient: 'from-dynamic-blue to-dynamic-cyan',
                borderColor:
                  'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
                size: 'lg:col-span-3',
              },
              {
                key: 'sam',
                image:
                  '/media/marketing/events/women-in-tech/sam-software-engineer-at-tuturuuu.jpg',
                gradient: 'from-dynamic-green to-dynamic-blue',
                borderColor:
                  'border-dynamic-green/30 bg-dynamic-green/10 hover:border-dynamic-green/50',
                size: 'lg:col-span-2',
              },
              {
                key: 'khoi',
                image:
                  '/media/marketing/events/women-in-tech/khoi-software-engineer-intern-at-tuturuuu.jpg',
                gradient: 'from-dynamic-red to-dynamic-purple',
                borderColor:
                  'border-dynamic-red/30 bg-dynamic-red/10 hover:border-dynamic-red/50',
                size: 'lg:col-span-2',
              },
              {
                key: 'khang',
                image:
                  '/media/marketing/events/women-in-tech/khang-junior-software-engineer-at-tuturuuu.jpg',
                gradient: 'from-dynamic-orange to-dynamic-red',
                borderColor:
                  'border-dynamic-orange/30 bg-dynamic-orange/10 hover:border-dynamic-orange/50',
                size: 'lg:col-span-2',
              },
            ].map((colleague, index) => (
              <motion.div
                key={colleague.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className={cn(colleague.size)}
              >
                <Card
                  className={cn(
                    'group h-full overflow-hidden transition-all hover:-translate-y-2 hover:shadow-xl',
                    colleague.borderColor
                  )}
                >
                  {/* Photo */}
                  <div className="relative aspect-square overflow-hidden">
                    <Image
                      src={colleague.image}
                      alt={t(
                        `maleColleagues.wishes.${colleague.key}.name` as any
                      )}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div
                      className={cn(
                        'absolute inset-0 bg-linear-to-t via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100',
                        `from-black/20`
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    {/* Name & Role Badge */}
                    <div className="mb-4 flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          'inline-block rounded-full px-4 py-1.5',
                          `bg-linear-to-r ${colleague.gradient}`
                        )}
                      >
                        <span className="font-bold text-sm text-white">
                          {t(
                            `maleColleagues.wishes.${colleague.key}.name` as any
                          )}
                        </span>
                      </div>
                      <p className="text-center text-foreground/60 text-xs">
                        {t(
                          `maleColleagues.wishes.${colleague.key}.role` as any
                        )}
                      </p>
                    </div>

                    {/* Decorative Quote */}
                    <div className="mb-3 flex justify-center">
                      <div
                        className={cn(
                          'h-1 w-12 rounded-full',
                          `bg-linear-to-r ${colleague.gradient}`
                        )}
                      />
                    </div>

                    {/* Wish Message */}
                    <div className="relative">
                      <div className="absolute -top-2 -left-2 text-4xl opacity-20">
                        <Heart className={cn('h-6 w-6')} />
                      </div>
                      <p className="relative text-center text-foreground/80 text-sm italic leading-relaxed">
                        "
                        {t(
                          `maleColleagues.wishes.${colleague.key}.message` as any
                        )}
                        "
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Partnerships Section */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
              {t('partnerships.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              {t('partnerships.subtitle')}
            </p>
          </div>

          <div className="grid gap-8 text-pretty text-center md:grid-cols-2 xl:grid-cols-6">
            {/* AllMind Partnership - Sophie & Sweet */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-blue/30 bg-dynamic-blue/10 p-0 shadow-xl transition-all hover:border-dynamic-blue/50 hover:shadow-2xl xl:col-span-2">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/empowering-women-led-startup-partners-from-allmind-2.jpeg"
                  alt="AllMind: Sophie & Sweet"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-blue text-sm">
                    {t('partnerships.allmind.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.allmind.description')}
                </p>
              </div>
            </Card>

            {/* RMIT University - Professor Iwona, Hoa & Nguyên */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-red/30 bg-dynamic-red/10 p-0 shadow-xl transition-all hover:border-dynamic-red/50 hover:shadow-2xl xl:col-span-2">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/professor-iwona-miliszewska-dean-of-sset-rmit.jpg"
                  alt="RMIT University: Professor Iwona, Hoa & Nguyên"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-red/20 bg-dynamic-red/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-red text-sm">
                    {t('partnerships.rmit.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.rmit.description')}
                </p>
                <Link
                  href={t('partnerships.rmit.link')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-dynamic-red text-sm transition-colors hover:text-dynamic-red/80"
                >
                  {t('partnerships.rmit.linkText')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>

            {/* SOKI Startup - Kim */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-orange/30 bg-dynamic-orange/10 p-0 shadow-xl transition-all hover:border-dynamic-orange/50 hover:shadow-2xl xl:col-span-2">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/soki-startup-another-women-led-startup-also-tuturuuus-neighbor-inside-spark-hub-community.jpg"
                  alt="SOKI Startup: Kim"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-orange/20 bg-dynamic-orange/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-orange text-sm">
                    {t('partnerships.soki.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.soki.description')}
                </p>
              </div>
            </Card>

            {/* Mai Nhung - rbac.vn Developer */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-cyan/30 bg-dynamic-cyan/10 p-0 shadow-xl transition-all hover:border-dynamic-cyan/50 hover:shadow-2xl xl:col-span-2">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/rbac-website-designed-and-developed-by-mai-nhung.jpg"
                  alt="Mai Nhung: rbac.vn Developer"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-cyan/20 bg-dynamic-cyan/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-cyan text-sm">
                    {t('partnerships.nhung.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.nhung.description')}
                </p>
              </div>
            </Card>

            {/* Đài - RBAC Project Leader */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-purple/30 bg-dynamic-purple/10 p-0 shadow-xl transition-all hover:border-dynamic-purple/50 hover:shadow-2xl xl:col-span-2">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/dai-rbac-project-leader.jpg"
                  alt="Đài: RBAC Project Leader"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-purple text-sm">
                    {t('partnerships.dai.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.dai.description')}
                </p>
              </div>
            </Card>

            {/* Như - RBAC Project Assistant */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-blue/30 bg-dynamic-blue/10 p-0 shadow-xl transition-all hover:border-dynamic-blue/50 hover:shadow-2xl xl:col-span-2">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/nhu-rbac-project-assistant.jpg"
                  alt="Như: RBAC Project Assistant"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-blue text-sm">
                    {t('partnerships.nhu.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.nhu.description')}
                </p>
              </div>
            </Card>

            {/* Community Engagement */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-pink/30 bg-dynamic-pink/10 p-0 shadow-xl transition-all hover:border-dynamic-pink/50 hover:shadow-2xl xl:col-span-3">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/empowering-women-in-stem-from-student-club.jpg"
                  alt="Community Partnerships"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-pink/20 bg-dynamic-pink/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-pink text-sm">
                    {t('partnerships.community.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.community.description')}
                </p>
              </div>
            </Card>

            {/* SPARK Hub - Tien */}
            <Card className="h-full overflow-hidden border-2 border-dynamic-green/30 bg-dynamic-green/10 p-0 shadow-xl transition-all hover:border-dynamic-green/50 hover:shadow-2xl xl:col-span-3">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src="/media/marketing/events/women-in-tech/spark-hub-program-coordinator.jpeg"
                  alt="SPARK Hub: Tien"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-col items-center justify-center p-8">
                <div className="mb-4 inline-block rounded-full border border-dynamic-green/20 bg-dynamic-green/10 px-4 py-2">
                  <span className="font-semibold text-dynamic-green text-sm">
                    {t('partnerships.sparkHub.title')}
                  </span>
                </div>
                <p className="text-foreground/80">
                  {t('partnerships.sparkHub.description')}
                </p>
                <div className="mt-4 rounded-r-lg border-dynamic-green/30 border-l-4 bg-dynamic-green/5 p-4">
                  <p className="text-foreground/70 text-sm italic">
                    "{t('partnerships.sparkHub.quote')}"
                  </p>
                  <p className="mt-2 text-foreground/60 text-xs">
                    — Tiên, SPARK Hub
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Decorative Divider */}
      <div className="relative mx-auto max-w-4xl px-4 py-12">
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="h-px w-full bg-linear-to-r from-transparent via-dynamic-pink/40 to-transparent"
        />
      </div>

      {/* CTA Section */}
      <section className="relative px-4 py-20 pb-32 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <motion.div {...fadeInViewVariant(0)}>
            <Card
              className={cn(
                'relative overflow-hidden border border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/10 to-background p-12'
              )}
            >
              <div className="relative text-center">
                <div className="mb-6 inline-block rounded-2xl bg-linear-to-r from-dynamic-pink to-dynamic-purple p-4 shadow-lg">
                  <Rocket className="h-12 w-12 text-white" />
                </div>

                <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-2xl text-transparent md:text-4xl">
                  {t('cta.title')}
                </h2>

                <p className="mx-auto mb-8 max-w-2xl text-foreground/80 text-lg">
                  {t('cta.description')}
                </p>

                <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
                  <Button
                    size="lg"
                    className="bg-linear-to-r from-dynamic-pink to-dynamic-purple shadow-lg transition-all hover:shadow-xl"
                    asChild
                  >
                    <Link href="/careers">
                      <Rocket className="mr-2 h-5 w-5" />
                      {t('cta.joinTeam')}
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-2 border-dynamic-pink/30 transition-all hover:border-dynamic-pink/50 hover:bg-dynamic-pink/5"
                    asChild
                  >
                    <Link href="/about">
                      <Heart className="mr-2 h-5 w-5" />
                      {t('cta.learnMore')}
                    </Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/70 text-sm">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-dynamic-yellow" />
                    {t('cta.benefits.growth')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-dynamic-blue" />
                    {t('cta.benefits.culture')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-dynamic-purple" />
                    {t('cta.benefits.impact')}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Bottom Language Switcher */}
      <section className="relative px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            {...fadeInViewVariant(0)}
            className="flex items-center justify-center"
          >
            <LanguageSwitcher
              locale={locale}
              className="items-center justify-center"
              reduceEffects={shouldReduceMotion}
            />
          </motion.div>
        </div>
      </section>
    </main>
  );
}
