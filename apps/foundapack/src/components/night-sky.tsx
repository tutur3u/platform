'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function NightSky() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="fixed inset-0 z-0 bg-pack-void" />;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-pack-void">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-pack-charcoal/20 via-pack-void to-pack-void opacity-80" />

      {/* Stars Layer */}
      <div className="pack-stars absolute inset-0">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white"
            initial={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              scale: Math.random() * 0.5 + 0.5,
              opacity: Math.random() * 0.5 + 0.2,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              willChange: 'opacity',
            }}
          />
        ))}
      </div>
    </div>
  );
}
