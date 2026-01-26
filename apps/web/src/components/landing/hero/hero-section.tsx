'use client';

import { ArrowRight, Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TrustBadges } from './trust-badges';
import { VideoHero } from './video-hero';

export function HeroSection() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative flex min-h-dvh flex-col justify-center px-4 pt-16 pb-12 sm:min-h-0 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-20">
      {/* Aurora Background - Light beams effect */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-[53px] bottom-0 -z-20 overflow-hidden"
        style={
          {
            '--blue-300': '#93c5fd',
            '--blue-400': '#60a5fa',
            '--blue-500': '#3b82f6',
            '--indigo-300': '#a5b4fc',
            '--violet-200': '#ddd6fe',
            '--purple-400': '#c084fc',
            '--cyan-300': '#67e8f9',
            '--teal-300': '#5eead4',
            '--pink-300': '#f9a8d4',
          } as React.CSSProperties
        }
      >
        {/* Primary aurora with light beams */}
        <div
          className="absolute -inset-[10px] opacity-60 blur-[10px] invert filter will-change-transform [background-image:var(--white-gradient),var(--aurora)] [background-position:50%_50%,50%_50%] [background-size:300%,_200%] after:absolute after:inset-0 after:animate-aurora after:mix-blend-difference after:content-[''] dark:invert-0 after:[background-attachment:fixed] after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:200%,_100%]"
          style={
            {
              '--aurora':
                'repeating-linear-gradient(100deg, var(--purple-400) 10%, var(--indigo-300) 15%, var(--blue-300) 20%, var(--violet-200) 25%, var(--blue-400) 30%)',
              '--white-gradient':
                'repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%)',
            } as React.CSSProperties
          }
        />
        {/* Secondary aurora layer - different angle */}
        <div
          className="absolute -inset-[10px] opacity-40 blur-[10px] invert filter will-change-transform [background-image:var(--white-gradient),var(--aurora)] [background-position:50%_50%,50%_50%] [background-size:250%,_180%] [mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)] after:absolute after:inset-0 after:animate-aurora after:mix-blend-difference after:content-[''] dark:invert-0 after:[background-attachment:fixed] after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:180%,_120%]"
          style={
            {
              '--aurora':
                'repeating-linear-gradient(100deg, var(--cyan-300) 10%, var(--teal-300) 15%, var(--blue-500) 20%, var(--pink-300) 25%, var(--indigo-300) 30%)',
              '--white-gradient':
                'repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%)',
              animationDuration: '8s',
            } as React.CSSProperties
          }
        />
      </div>

      {/* Gradient Blobs - Ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 -top-[53px] bottom-0 -z-10 overflow-hidden">
        {/* Large ambient blob - Top Left */}
        <div className="absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-dynamic-purple/40 via-dynamic-indigo/25 to-transparent blur-[100px]" />
        {/* Large ambient blob - Top Right */}
        <div className="absolute -top-20 -right-32 h-[550px] w-[550px] rounded-full bg-gradient-to-bl from-dynamic-cyan/35 via-dynamic-blue/20 to-transparent blur-[90px]" />
        {/* Center glow */}
        <div className="absolute top-1/3 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-b from-dynamic-blue/30 via-dynamic-indigo/15 to-transparent blur-[80px]" />
        {/* Bottom accent */}
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[500px] translate-y-1/4 rounded-full bg-gradient-to-t from-dynamic-pink/30 via-dynamic-violet/15 to-transparent blur-[70px]" />
      </div>

      {/* Subtle Grid Background */}
      <div className="pointer-events-none absolute inset-0 -z-[5]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Compact Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 text-center sm:mb-10"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Badge
              variant="secondary"
              className="mb-4 gap-1.5 border-foreground/10 bg-foreground/5 px-3 py-1.5 text-foreground/70 backdrop-blur-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('badge')}
            </Badge>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mx-auto mb-4 max-w-4xl font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-6xl"
          >
            <span>{t('title.line1')}</span>{' '}
            <span className="bg-gradient-to-r from-dynamic-purple via-dynamic-blue to-dynamic-cyan bg-clip-text text-transparent">
              {t('title.line2')}
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mx-auto mb-6 max-w-2xl text-balance text-base text-foreground/60 leading-relaxed sm:text-lg"
          >
            {t('description')}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
          >
            <Button
              size="lg"
              className="group w-full bg-gradient-to-r from-dynamic-purple to-dynamic-blue px-8 font-medium text-white shadow-dynamic-purple/25 shadow-lg transition-all hover:shadow-dynamic-purple/30 hover:shadow-xl sm:w-auto"
              asChild
            >
              <Link href="/onboarding">
                {t('cta.primary')}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>

        {/* Video - The Star of the Show */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 sm:mb-10"
        >
          <VideoHero />
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <TrustBadges />
        </motion.div>
      </div>
    </section>
  );
}
