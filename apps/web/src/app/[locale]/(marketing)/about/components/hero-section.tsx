'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Brain, Globe, Heart } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface BadgeProps {
  icon: ReactNode;
  text: string;
}

const badges: BadgeProps[] = [
  {
    icon: <Heart className="h-5 w-5 animate-pulse" />,
    text: 'Life-Changing Impact',
  },
  {
    icon: <Brain className="h-5 w-5 animate-[pulse_2s_ease-in-out_infinite]" />,
    text: 'Breakthrough Innovation',
  },
  {
    icon: <Globe className="h-5 w-5 animate-[pulse_3s_ease-in-out_infinite]" />,
    text: 'Universal Access',
  },
];

export function HeroSection() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative text-center"
    >
      <div className="-z-10 pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_700px_at_30%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_70%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-size-[40px] opacity-20" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-size-[40px] opacity-20" />
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="relative"
      >
        <Badge
          variant="secondary"
          className="relative mb-6 cursor-default transition-colors hover:bg-primary/20"
        >
          <span className="relative bg-linear-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
            Our Vision
          </span>
        </Badge>
      </motion.div>

      <motion.h1
        className="mb-6 text-balance font-bold text-4xl text-foreground tracking-tight md:text-7xl"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        Pioneering{' '}
        <span className="inline-block">
          <span className="bg-linear-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Breakthroughs
          </span>
        </span>{' '}
        <br />
        <span className="bg-linear-to-r from-primary via-blue-500 to-cyan-500 bg-clip-text text-transparent">
          for Everyone
        </span>
      </motion.h1>

      <motion.p
        className="mx-auto mb-12 max-w-2xl text-balance text-foreground/80 text-lg leading-relaxed md:text-xl"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        At Tuturuuu, we&apos;re driven by an audacious vision: to become one of
        the world&apos;s most innovative technology companies. But our mission
        transcends innovation—we&apos;re here to create life-changing
        breakthroughs that touch lives across the globe,{' '}
        <strong className="bg-linear-to-r from-primary to-primary/60 bg-clip-text font-bold text-transparent">
          making the impossible possible for everyone, everywhere.
        </strong>
      </motion.p>

      <div className="flex flex-wrap justify-center gap-4">
        {badges.map((badge, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 + index * 0.1 }}
            whileHover={{ scale: 1.05 }}
            className="flex cursor-default items-center gap-2 rounded-full bg-linear-to-r from-foreground/5 to-foreground/10 px-4 py-2 transition-colors hover:from-primary/10 hover:to-primary/5"
          >
            <span className="text-primary">{badge.icon}</span>
            <span className="font-medium text-foreground/80 text-sm">
              {badge.text}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
