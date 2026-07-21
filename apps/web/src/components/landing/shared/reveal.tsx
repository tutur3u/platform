'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * One motion language for the whole landing page.
 *
 * Every section previously hand-rolled its own `initial`/`whileInView` pair
 * with slightly different distances, delays and easings. These presets keep the
 * page feeling like a single designed object, and honour reduced-motion in one
 * place instead of six.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'scale';

const offsets: Record<RevealDirection, { x?: number; y?: number }> = {
  up: { y: 28 },
  down: { y: -28 },
  left: { x: 28 },
  right: { x: -28 },
  scale: {},
};

interface RevealProps {
  children: ReactNode;
  className?: string;
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  /** Adds a defocus-to-focus pass; use sparingly, it is the expensive one. */
  blur?: boolean;
  once?: boolean;
}

export function Reveal({
  children,
  className,
  direction = 'up',
  delay = 0,
  duration = 0.7,
  blur = false,
  once = true,
}: RevealProps) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  const offset = offsets[direction];

  return (
    <motion.div
      className={className}
      initial={{
        opacity: 0,
        ...offset,
        ...(direction === 'scale' ? { scale: 0.96 } : {}),
        ...(blur ? { filter: 'blur(10px)' } : {}),
      }}
      transition={{ duration, delay, ease: EASE }}
      viewport={{ once, margin: '-80px' }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        ...(blur ? { filter: 'blur(0px)' } : {}),
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered container: children reveal in sequence as the group scrolls in.
 * Use `RevealItem` for each child.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      transition={{ staggerChildren: stagger, delayChildren: delay }}
      viewport={{ once: true, margin: '-80px' }}
      whileInView="visible"
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.7, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
