'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface Founder {
  name: string;
  role: string;
  startup: string;
  x: number;
  y: number;
}

const founders: Founder[] = [
  // Tuturuuu
  { name: 'Phuc', role: 'Founder & CEO', startup: 'Tuturuuu', x: 50, y: 20 },
  { name: 'Tien', role: 'Growth Lead', startup: 'Tuturuuu', x: 60, y: 30 },
  // Noah
  { name: 'Nghi', role: 'Co-founder', startup: 'Noah', x: 20, y: 60 },
  { name: 'Toida', role: 'Co-founder', startup: 'Noah', x: 30, y: 70 },
  { name: 'Yen', role: 'Member', startup: 'Noah', x: 25, y: 80 },
  // AICC
  { name: 'Shirin', role: 'Co-founder', startup: 'AICC', x: 80, y: 60 },
  { name: 'Thao', role: 'Co-founder', startup: 'AICC', x: 90, y: 70 },
  { name: 'Nghi', role: 'Co-founder', startup: 'AICC', x: 85, y: 80 },
];

export function AlphaConstellation() {
  const [activeId, setActiveId] = useState<number | null>(null);

  return (
    <div className="relative h-full w-full">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {/* Intra-pack connections */}
        {founders.map((f1, i) =>
          founders.slice(i + 1).map((f2, j) => {
            const actualJ = i + 1 + j;
            if (f1.startup === f2.startup) {
              return (
                <motion.line
                  key={`intra-${i}-${actualJ}`}
                  x1={`${f1.x}%`}
                  y1={`${f1.y}%`}
                  x2={`${f2.x}%`}
                  y2={`${f2.y}%`}
                  stroke="rgba(251, 191, 36, 0.4)"
                  strokeWidth="1"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5, delay: 0.2 }}
                />
              );
            }
            return null;
          })
        )}

        {/* Inter-pack connections (Mesh) */}
        <motion.line
          x1={`${founders[1]!.x}%`}
          y1={`${founders[1]!.y}%`} // Tien
          x2={`${founders[4]!.x}%`}
          y2={`${founders[4]!.y}%`} // Shirin
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="0.5"
          strokeDasharray="4 4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        />
        <motion.line
          x1={`${founders[0]!.x}%`}
          y1={`${founders[0]!.y}%`} // Phuc
          x2={`${founders[2]!.x}%`}
          y2={`${founders[2]!.y}%`} // Nghi
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="0.5"
          strokeDasharray="4 4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
        />
        <motion.line
          x1={`${founders[3]!.x}%`}
          y1={`${founders[3]!.y}%`} // Toida
          x2={`${founders[6]!.x}%`}
          y2={`${founders[6]!.y}%`} // Nghi (AICC)
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="0.5"
          strokeDasharray="4 4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.1 }}
        />
      </svg>

      {founders.map((founder, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: `${founder.x}%`, top: `${founder.y}%` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.1 }}
        >
          <div
            className="group relative cursor-pointer"
            onMouseEnter={() => setActiveId(i)}
            onMouseLeave={() => setActiveId(null)}
          >
            {/* Star */}
            <div className="h-4 w-4 rounded-full bg-pack-amber shadow-[0_0_15px_#fbbf24] transition-transform group-hover:scale-150" />

            {/* Label */}
            <span className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-pack-frost text-xs opacity-70 transition-opacity group-hover:opacity-100">
              {founder.name}
            </span>

            {/* Card (Hover) */}
            {activeId === i && (
              <motion.div
                className="absolute top-8 left-1/2 z-50 w-48 -translate-x-1/2 rounded-lg border border-pack-amber/30 bg-pack-surface/90 p-4 shadow-2xl backdrop-blur-md"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h4 className="font-bold text-pack-white">{founder.name}</h4>
                <p className="mb-1 text-pack-amber text-xs">{founder.role}</p>
                <p className="text-pack-frost/50 text-xs uppercase tracking-wider">
                  {founder.startup}
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
