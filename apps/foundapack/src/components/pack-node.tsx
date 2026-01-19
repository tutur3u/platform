'use client';

import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useMagnetic } from '@/hooks/use-magnetic';

interface PackNodeProps {
  x: number;
  y: number;
  label: string;
  active?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

export function PackNode({
  x,
  y,
  label,
  active,
  onHoverStart,
  onHoverEnd,
}: PackNodeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { x: magX, y: magY } = useMagnetic(ref, {
    strength: 0.2,
    radius: 100,
  });

  return (
    <motion.div
      ref={ref}
      style={{ left: `${x}%`, top: `${y}%`, x: magX, y: magY }}
      className="absolute z-10"
    >
      <motion.div
        className="group relative flex cursor-pointer items-center justify-center"
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        {/* Pulsing Outer Halo */}
        <motion.div
          animate={{
            scale: active ? [1, 1.5, 1] : [1, 1.2, 1],
            opacity: active ? [0.4, 0, 0.4] : [0.2, 0, 0.2],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute h-12 w-12 rounded-full bg-pack-amber/20 blur-sm"
        />

        {/* Core Node */}
        <div className="relative h-4 w-4 rounded-full border border-pack-amber bg-pack-charcoal shadow-[0_0_15px_var(--color-pack-amber)] transition-all duration-300 group-hover:scale-125 group-hover:bg-pack-amber">
          {/* Inner Spark */}
          <div className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pack-white" />
        </div>

        {/* Label (Always visible but subtle) */}
        <span
          className={`absolute top-8 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest transition-all duration-300 ${
            active
              ? 'translate-y-0 text-pack-amber opacity-100'
              : 'translate-y-1 text-pack-frost/50 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
          }`}
        >
          {label}
        </span>
      </motion.div>
    </motion.div>
  );
}
