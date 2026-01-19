'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// Geometric definition of a low-poly wolf head (Front facing)
const nodes = [
  { id: 'nose', x: 50, y: 75 },
  { id: 'snout_top', x: 50, y: 60 },
  { id: 'eye_l', x: 35, y: 50 },
  { id: 'eye_r', x: 65, y: 50 },
  { id: 'ear_l_tip', x: 25, y: 15 },
  { id: 'ear_r_tip', x: 75, y: 15 },
  { id: 'ear_l_base', x: 35, y: 35 },
  { id: 'ear_r_base', x: 65, y: 35 },
  { id: 'forehead', x: 50, y: 30 },
  { id: 'cheek_l', x: 20, y: 60 },
  { id: 'cheek_r', x: 80, y: 60 },
  { id: 'jaw_l', x: 35, y: 80 },
  { id: 'jaw_r', x: 65, y: 80 },
];

const connections = [
  // Snout / Central
  ['nose', 'snout_top'],
  ['snout_top', 'forehead'],
  ['nose', 'jaw_l'],
  ['nose', 'jaw_r'],
  ['jaw_l', 'cheek_l'],
  ['jaw_r', 'cheek_r'],

  // Eyes mask
  ['snout_top', 'eye_l'],
  ['snout_top', 'eye_r'],
  ['eye_l', 'forehead'],
  ['eye_r', 'forehead'],
  ['eye_l', 'cheek_l'],
  ['eye_r', 'cheek_r'],

  // Ears
  ['eye_l', 'ear_l_base'],
  ['eye_r', 'ear_r_base'],
  ['ear_l_base', 'ear_l_tip'],
  ['ear_r_base', 'ear_r_tip'],
  ['ear_l_tip', 'forehead'], // Connection back to head
  ['ear_r_tip', 'forehead'],
  ['ear_l_base', 'cheek_l'],
  ['ear_r_base', 'cheek_r'],
];

export function WolfSilhouette() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-72 w-72 md:h-125 md:w-125" />;

  return (
    <div className="relative flex h-72 w-72 items-center justify-center md:h-150 md:w-150">
      {/* 1. Core Atmosphere - The "Spark" */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--color-pack-amber)_0%,transparent_70%)] opacity-20 blur-3xl"
      />

      {/* 2. Rotating Ring (The Void boundary) */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full border border-pack-amber/5 opacity-20"
        style={{ width: '90%', height: '90%', left: '5%', top: '5%' }}
      />

      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full border border-pack-frost/10 border-dashed opacity-30"
        style={{ width: '70%', height: '70%', left: '15%', top: '15%' }}
      />

      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 h-full w-full drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]"
        aria-labelledby="wolf-title"
      >
        <title id="wolf-title">Constellation Wolf</title>
        {/* Connections (Wireframe) */}
        {connections.map(([startId, endId], i) => {
          const start = nodes.find((n) => n.id === startId);
          const end = nodes.find((n) => n.id === endId);
          if (!start || !end) return null;

          return (
            <motion.line
              key={`${startId}-${endId}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="var(--color-pack-amber)"
              strokeWidth="0.5"
              strokeOpacity="0.4"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: 1,
                opacity: [0.2, 0.6, 0.2],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: i * 0.1,
                ease: 'easeInOut',
              }}
            />
          );
        })}

        {/* Nodes (Stars) */}
        {nodes.map((node, i) => (
          <motion.g key={node.id}>
            {/* Glow */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="3" // Glow radius
              fill="var(--color-pack-amber)"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.3, 0] }}
              transition={{
                duration: 2 + Math.random(),
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
            {/* Core Dot */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r={node.id.includes('eye') ? 1 : 0.6}
              fill={
                node.id.includes('eye') ? '#fff' : 'var(--color-pack-amber)'
              }
              initial={{ scale: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.05 }}
            />
          </motion.g>
        ))}

        {/* The Spark (Heart) */}
        <motion.circle
          cx="50"
          cy="60"
          r="15"
          fill="url(#spark-gradient)"
          filter="blur(10px)"
          animate={{ opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        <defs>
          <radialGradient
            id="spark-gradient"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(50 60) rotate(90) scale(15)"
          >
            <stop stopColor="var(--color-pack-amber)" />
            <stop
              offset="1"
              stopColor="var(--color-pack-amber)"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
