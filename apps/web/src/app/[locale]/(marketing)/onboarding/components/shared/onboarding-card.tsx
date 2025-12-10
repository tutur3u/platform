'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

interface OnboardingCardProps {
  children: ReactNode;
  className?: string;
  direction?: 'forward' | 'backward';
}

const cardVariants: Variants = {
  initial: (direction: 'forward' | 'backward') => ({
    opacity: 0,
    x: direction === 'forward' ? 100 : -100,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 120,
    },
  },
  exit: (direction: 'forward' | 'backward') => ({
    opacity: 0,
    x: direction === 'forward' ? -100 : 100,
    transition: {
      duration: 0.2,
    },
  }),
};

export function OnboardingCard({
  children,
  className,
  direction = 'forward',
}: OnboardingCardProps) {
  return (
    <motion.div
      custom={direction}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        'w-full max-w-2xl rounded-2xl border bg-background p-8 shadow-xl',
        className
      )}
    >
      {children}
    </motion.div>
  );
}

// Animated container for the entire onboarding layout
interface OnboardingLayoutProps {
  children: ReactNode;
  className?: string;
}

export function OnboardingLayout({
  children,
  className,
}: OnboardingLayoutProps) {
  return (
    <div
      className={cn(
        'flex min-h-screen flex-col items-center justify-center p-4',
        className
      )}
    >
      {children}
    </div>
  );
}

// Header component for screens
interface OnboardingHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

export function OnboardingHeader({
  icon,
  title,
  subtitle,
  className,
}: OnboardingHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className={cn('mb-8 text-center', className)}
    >
      {icon && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            damping: 15,
            stiffness: 200,
            delay: 0.2,
          }}
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
        >
          {icon}
        </motion.div>
      )}
      <h1 className="mb-3 font-bold text-3xl tracking-tight md:text-4xl">
        {title}
      </h1>
      {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
    </motion.div>
  );
}
