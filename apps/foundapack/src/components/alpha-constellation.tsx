'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Founder {
  id: string;
  name: string;
  role: string;
  startup: 'Tuturuuu' | 'Noah' | 'AICC';
  x: number;
  y: number;
}

const STARTUP_COLORS: Record<string, { primary: string; glow: string }> = {
  Tuturuuu: { primary: '#fbbf24', glow: 'rgba(251, 191, 36, 0.6)' },
  Noah: { primary: '#60a5fa', glow: 'rgba(96, 165, 250, 0.6)' },
  AICC: { primary: '#a78bfa', glow: 'rgba(167, 139, 250, 0.6)' },
};

const founders: Founder[] = [
  // Tuturuuu - Top center cluster
  {
    id: 'phuc',
    name: 'Phuc',
    role: 'Founder & CEO',
    startup: 'Tuturuuu',
    x: 50,
    y: 15,
  },
  {
    id: 'tien',
    name: 'Tien',
    role: 'Growth Lead',
    startup: 'Tuturuuu',
    x: 62,
    y: 28,
  },
  // Noah - Bottom left cluster
  {
    id: 'nghi-noah',
    name: 'Nghi',
    role: 'Co-founder',
    startup: 'Noah',
    x: 18,
    y: 55,
  },
  {
    id: 'toida',
    name: 'Toida',
    role: 'Co-founder',
    startup: 'Noah',
    x: 28,
    y: 72,
  },
  {
    id: 'yen',
    name: 'Yen',
    role: 'Member',
    startup: 'Noah',
    x: 12,
    y: 75,
  },
  // AICC - Bottom right cluster
  {
    id: 'shirin',
    name: 'Shirin',
    role: 'Co-founder',
    startup: 'AICC',
    x: 78,
    y: 55,
  },
  {
    id: 'thao',
    name: 'Thao',
    role: 'Co-founder',
    startup: 'AICC',
    x: 88,
    y: 68,
  },
  {
    id: 'nghi-aicc',
    name: 'Nghi',
    role: 'Co-founder',
    startup: 'AICC',
    x: 72,
    y: 75,
  },
];

// Inter-pack connections representing collaboration
const interPackConnections = [
  { from: 'phuc', to: 'nghi-noah' },
  { from: 'phuc', to: 'shirin' },
  { from: 'tien', to: 'thao' },
  { from: 'toida', to: 'nghi-aicc' },
];

function StarNode({
  founder,
  index,
  isActive,
  onHover,
}: {
  founder: Founder;
  index: number;
  isActive: boolean;
  onHover: (active: boolean) => void;
}) {
  const colors = STARTUP_COLORS[founder.startup];
  const nodeRef = useRef<HTMLDivElement>(null);

  // Subtle floating animation
  const floatY = useMotionValue(0);
  const springY = useSpring(floatY, { stiffness: 100, damping: 20 });

  useEffect(() => {
    const interval = setInterval(() => {
      floatY.set(Math.sin(Date.now() / 1000 + index) * 3);
    }, 50);
    return () => clearInterval(interval);
  }, [floatY, index]);

  return (
    <motion.div
      ref={nodeRef}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${founder.x}%`,
        top: `${founder.y}%`,
        y: springY,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 15,
        delay: index * 0.08,
      }}
    >
      <div
        className="group relative cursor-pointer"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        {/* Outer glow ring */}
        <motion.div
          className="absolute -inset-3 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(circle, ${colors?.glow} 0%, transparent 70%)`,
          }}
          animate={isActive ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* Star core */}
        <motion.div
          className={cn(
            'relative h-5 w-5 rounded-full transition-all duration-300',
            'group-hover:scale-150'
          )}
          style={{
            backgroundColor: colors?.primary,
            boxShadow: `0 0 20px ${colors?.glow}, 0 0 40px ${colors?.glow}`,
          }}
          animate={{
            boxShadow: isActive
              ? [
                  `0 0 20px ${colors?.glow}, 0 0 40px ${colors?.glow}`,
                  `0 0 30px ${colors?.glow}, 0 0 60px ${colors?.glow}`,
                  `0 0 20px ${colors?.glow}, 0 0 40px ${colors?.glow}`,
                ]
              : `0 0 20px ${colors?.glow}, 0 0 40px ${colors?.glow}`,
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {/* Inner highlight */}
          <div className="absolute inset-1 rounded-full bg-white/40" />
        </motion.div>

        {/* Name label */}
        <motion.span
          className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap font-medium text-xs tracking-wide"
          style={{ color: colors?.primary }}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: isActive ? 1 : 0.7 }}
        >
          {founder.name}
        </motion.span>

        {/* Hover card */}
        {isActive && (
          <motion.div
            className="absolute top-12 left-1/2 z-50 w-52 -translate-x-1/2"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div
              className="overflow-hidden rounded-xl border border-white/10 bg-pack-void/95 shadow-2xl backdrop-blur-xl"
              style={{ borderColor: `${colors?.primary}30` }}
            >
              {/* Gradient header */}
              <div
                className="h-1"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colors?.primary}, transparent)`,
                }}
              />
              <div className="p-4">
                <h4 className="mb-1 font-bold text-pack-white">
                  {founder.name}
                </h4>
                <p className="mb-2 text-sm" style={{ color: colors?.primary }}>
                  {founder.role}
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: colors?.primary }}
                  />
                  <span className="text-pack-frost/60 text-xs uppercase tracking-widest">
                    {founder.startup}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export function AlphaConstellation() {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Get founder by ID helper
  const getFounder = (id: string) => founders.find((f) => f.id === id);

  // Memoize intra-pack connections
  const intraPackLines = useMemo(() => {
    const lines: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
    }> = [];

    founders.forEach((f1, i) => {
      founders.slice(i + 1).forEach((f2) => {
        if (f1.startup === f2.startup) {
          const colors = STARTUP_COLORS[f1.startup];
          lines.push({
            key: `intra-${f1.id}-${f2.id}`,
            x1: f1.x,
            y1: f1.y,
            x2: f2.x,
            y2: f2.y,
            color: colors?.primary ?? '#fbbf24',
          });
        }
      });
    });

    return lines;
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Background nebula effect */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pack-amber/5 blur-[80px]" />
        <div className="absolute top-2/3 left-1/5 h-48 w-48 rounded-full bg-blue-500/5 blur-[60px]" />
        <div className="absolute top-2/3 right-1/5 h-48 w-48 rounded-full bg-purple-500/5 blur-[60px]" />
      </div>

      {/* Constellation lines SVG */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          {/* Gradient definitions for each startup */}
          <linearGradient id="grad-tuturuuu" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0)" />
            <stop offset="50%" stopColor="rgba(251, 191, 36, 0.6)" />
            <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
          </linearGradient>
          <linearGradient id="grad-noah" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(96, 165, 250, 0)" />
            <stop offset="50%" stopColor="rgba(96, 165, 250, 0.6)" />
            <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
          </linearGradient>
          <linearGradient id="grad-aicc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(167, 139, 250, 0)" />
            <stop offset="50%" stopColor="rgba(167, 139, 250, 0.6)" />
            <stop offset="100%" stopColor="rgba(167, 139, 250, 0)" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Intra-pack connections (same startup) */}
        {intraPackLines.map((line, i) => (
          <motion.line
            key={line.key}
            x1={`${line.x1}%`}
            y1={`${line.y1}%`}
            x2={`${line.x2}%`}
            y2={`${line.y2}%`}
            stroke={line.color}
            strokeWidth="1.5"
            strokeOpacity="0.4"
            filter="url(#glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 1.5, delay: 0.5 + i * 0.1 },
              opacity: { duration: 0.5, delay: 0.5 + i * 0.1 },
            }}
          />
        ))}

        {/* Inter-pack connections (between startups) - dashed lines */}
        {interPackConnections.map((conn, i) => {
          const f1 = getFounder(conn.from);
          const f2 = getFounder(conn.to);
          if (!f1 || !f2) return null;

          return (
            <motion.line
              key={`inter-${conn.from}-${conn.to}`}
              x1={`${f1.x}%`}
              y1={`${f1.y}%`}
              x2={`${f2.x}%`}
              y2={`${f2.y}%`}
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="6 8"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: { duration: 2, delay: 2 + i * 0.3 },
                opacity: { duration: 0.5, delay: 2 + i * 0.3 },
              }}
            />
          );
        })}

        {/* Animated pulse traveling along inter-pack lines */}
        {interPackConnections.map((conn, i) => {
          const f1 = getFounder(conn.from);
          const f2 = getFounder(conn.to);
          if (!f1 || !f2) return null;

          return (
            <motion.circle
              key={`pulse-${conn.from}-${conn.to}`}
              r="2"
              fill="white"
              opacity={0.6}
              filter="url(#glow)"
              initial={{ cx: `${f1.x}%`, cy: `${f1.y}%` }}
              animate={{
                cx: [`${f1.x}%`, `${f2.x}%`, `${f1.x}%`],
                cy: [`${f1.y}%`, `${f2.y}%`, `${f1.y}%`],
              }}
              transition={{
                duration: 4,
                delay: 3 + i * 0.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          );
        })}
      </svg>

      {/* Star nodes */}
      {founders.map((founder, i) => (
        <StarNode
          key={founder.id}
          founder={founder}
          index={i}
          isActive={activeId === founder.id}
          onHover={(active) => setActiveId(active ? founder.id : null)}
        />
      ))}

      {/* Legend */}
      <motion.div
        className="absolute right-4 bottom-4 flex flex-col gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3 }}
      >
        {Object.entries(STARTUP_COLORS).map(([name, colors]) => (
          <div key={name} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: colors.primary,
                boxShadow: `0 0 8px ${colors.glow}`,
              }}
            />
            <span className="text-[10px] text-pack-frost/50 uppercase tracking-widest">
              {name}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
