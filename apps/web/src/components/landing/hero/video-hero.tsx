'use client';

import {
  Calendar,
  CheckCircle2,
  MessageSquare,
  Play,
  Sparkles,
  TrendingUp,
} from '@tuturuuu/icons';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

const YOUTUBE_VIDEO_ID = 'JGWbvaAC24Q';

export function VideoHero() {
  const t = useTranslations('landing.hero.video');
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    // Scroll to center the video in viewport after a short delay to allow animation
    setTimeout(() => {
      containerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);
  }, []);

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-6xl">
      {/* Floating Elements - Left Side */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute top-4 left-0 z-10 hidden -translate-x-1/2 lg:block"
          >
            {/* Task Card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-4 w-52 rounded-xl border border-dynamic-green/20 bg-background/90 p-3 shadow-lg backdrop-blur-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-dynamic-green/15">
                  <CheckCircle2 className="h-3.5 w-3.5 text-dynamic-green" />
                </div>
                <span className="font-medium text-xs">
                  {t('floatingCards.taskCard.title')}
                </span>
              </div>
              <p className="mb-2 text-foreground/60 text-xs">
                {t('floatingCards.taskCard.description')}
              </p>
              <div className="flex items-center gap-1 text-dynamic-green text-xs">
                <Sparkles className="h-3 w-3" />
                <span>{t('floatingCards.taskCard.points')}</span>
              </div>
            </motion.div>

            {/* Calendar Event */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5,
              }}
              className="ml-8 w-44 rounded-xl border border-dynamic-blue/20 bg-background/90 p-3 shadow-lg backdrop-blur-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-dynamic-blue/15">
                  <Calendar className="h-3.5 w-3.5 text-dynamic-blue" />
                </div>
                <span className="font-medium text-xs">
                  {t('floatingCards.calendarCard.title')}
                </span>
              </div>
              <p className="text-foreground/60 text-xs">
                {t('floatingCards.calendarCard.event')}
              </p>
              <p className="text-dynamic-blue text-xs">
                {t('floatingCards.calendarCard.time')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Elements - Right Side */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute top-4 right-0 z-10 hidden translate-x-1/2 lg:block"
          >
            {/* AI Chat Bubble */}
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.3,
              }}
              className="mb-4 w-52 rounded-xl border border-dynamic-purple/20 bg-background/90 p-3 shadow-lg backdrop-blur-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-dynamic-purple/15">
                  <MessageSquare className="h-3.5 w-3.5 text-dynamic-purple" />
                </div>
                <span className="font-medium text-xs">
                  {t('floatingCards.aiCard.title')}
                </span>
                <span className="ml-auto flex h-2 w-2 rounded-full bg-dynamic-green">
                  <span className="inline-flex h-full w-full animate-ping rounded-full bg-dynamic-green opacity-75" />
                </span>
              </div>
              <p className="text-foreground/60 text-xs leading-relaxed">
                {t('floatingCards.aiCard.message')}
              </p>
            </motion.div>

            {/* Analytics Card */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.7,
              }}
              className="mr-8 w-40 rounded-xl border border-dynamic-cyan/20 bg-background/90 p-3 shadow-lg backdrop-blur-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-dynamic-cyan/15">
                  <TrendingUp className="h-3.5 w-3.5 text-dynamic-cyan" />
                </div>
                <span className="font-medium text-xs">
                  {t('floatingCards.productivityCard.title')}
                </span>
              </div>
              <div className="mb-0.5 font-bold text-2xl text-dynamic-cyan">
                {t('floatingCards.productivityCard.stat')}
              </div>
              <p className="text-foreground/50 text-xs">
                {t('floatingCards.productivityCard.change')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gradient Border Glow */}
      <div className="absolute -inset-px overflow-hidden rounded-2xl bg-gradient-to-b from-dynamic-purple/40 via-dynamic-blue/20 to-dynamic-cyan/40" />

      {/* Main Video Container */}
      <div className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-2xl">
        {/* Browser Chrome */}
        <div className="flex items-center gap-2 overflow-hidden rounded-2xl border-foreground/5 border-b bg-foreground/[0.02] px-4 py-2.5">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-dynamic-red/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-dynamic-yellow/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-dynamic-green/60" />
          </div>
          <div className="mx-auto flex-1 text-center">
            <span className="font-mono text-foreground/40 text-xs">
              tuturuuu.com
            </span>
          </div>
        </div>

        {/* Video Area */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {!isPlaying ? (
              <motion.button
                key="thumbnail"
                type="button"
                onClick={handlePlay}
                className="group relative block aspect-video w-full cursor-pointer focus:outline-none"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Thumbnail */}
                <Image
                  src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/maxresdefault.jpg`}
                  alt={t('thumbnail')}
                  fill
                  unoptimized
                  className="block object-cover opacity-90 transition-all duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
                />

                {/* Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    {/* Glow */}
                    <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-dynamic-purple/50 via-dynamic-blue/50 to-dynamic-cyan/50 opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-80" />

                    {/* Button */}
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-purple via-dynamic-blue to-dynamic-cyan shadow-2xl transition-transform duration-300 group-hover:scale-110 sm:h-24 sm:w-24">
                      <Play className="h-8 w-8 translate-x-0.5 text-white sm:h-10 sm:w-10" />
                    </div>
                  </div>
                </div>
              </motion.button>
            ) : (
              <motion.div
                key="video"
                className="aspect-video w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&showinfo=0`}
                  title={t('title')}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Gradient Blobs - Vibrant, animated */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Large ambient blob - Top Left */}
        <div
          className="absolute -top-32 -left-32 h-[450px] w-[450px] rounded-full bg-gradient-to-br from-dynamic-purple/50 via-dynamic-indigo/30 to-transparent blur-[80px]"
          style={{ animation: 'pulse 8s ease-in-out infinite' }}
        />
        {/* Large ambient blob - Bottom Right */}
        <div
          className="absolute -right-32 -bottom-32 h-[450px] w-[450px] rounded-full bg-gradient-to-tl from-dynamic-blue/50 via-dynamic-cyan/30 to-transparent blur-[80px]"
          style={{
            animation: 'pulse 8s ease-in-out infinite',
            animationDelay: '2s',
          }}
        />
        {/* Center glow - Large ellipse */}
        <div className="absolute top-1/2 left-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-dynamic-purple/35 via-dynamic-blue/25 to-dynamic-cyan/35 blur-[60px]" />
        {/* Accent blob - Top Right */}
        <div
          className="absolute -top-16 -right-16 h-80 w-80 rounded-full bg-gradient-to-bl from-dynamic-cyan/45 via-dynamic-teal/25 to-transparent blur-[50px]"
          style={{
            animation: 'pulse 6s ease-in-out infinite',
            animationDelay: '1s',
          }}
        />
        {/* Accent blob - Bottom Left */}
        <div
          className="absolute -bottom-16 -left-16 h-80 w-80 rounded-full bg-gradient-to-tr from-dynamic-pink/40 via-dynamic-violet/25 to-transparent blur-[50px]"
          style={{
            animation: 'pulse 7s ease-in-out infinite',
            animationDelay: '3s',
          }}
        />
        {/* Floating accent - Top Center */}
        <div
          className="absolute -top-20 left-1/3 h-64 w-96 rounded-full bg-gradient-to-b from-dynamic-indigo/40 via-dynamic-purple/20 to-transparent blur-[45px]"
          style={{
            animation: 'pulse 9s ease-in-out infinite',
            animationDelay: '4s',
          }}
        />
        {/* Floating accent - Bottom Center */}
        <div
          className="absolute right-1/3 -bottom-20 h-64 w-96 rounded-full bg-gradient-to-t from-dynamic-teal/35 via-dynamic-cyan/20 to-transparent blur-[45px]"
          style={{
            animation: 'pulse 10s ease-in-out infinite',
            animationDelay: '5s',
          }}
        />
      </div>
    </div>
  );
}
