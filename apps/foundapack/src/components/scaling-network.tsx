'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { AlphaConstellation } from './alpha-constellation';
import { InfiniteParticles } from './infinite-particles';

export function ScalingNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { scrollYProgress } = useScroll({
    target: isMounted ? containerRef : undefined,
    offset: ['start start', 'end end'],
  });

  // Phases: 0-0.33 (One), 0.33-0.66 (Many), 0.66-1 (Infinite)

  // Opacity transitions
  const oneOpacity = useTransform(scrollYProgress, [0, 0.2, 0.4], [1, 1, 0]);
  const manyOpacity = useTransform(
    scrollYProgress,
    [0.2, 0.4, 0.6, 0.8],
    [0, 1, 1, 0]
  );
  const infiniteOpacity = useTransform(
    scrollYProgress,
    [0.6, 0.8, 1],
    [0, 1, 1]
  );

  return (
    <section ref={containerRef} className="relative h-[400vh] bg-pack-void">
      <div className="scaling-network-viz sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
        {/* State 1: The One (Lone Wolf) */}
        <motion.div
          style={{ opacity: oneOpacity }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="relative">
            <div className="h-4 w-4 rounded-full bg-white shadow-[0_0_20px_white]" />
            <p className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-pack-frost">
              The Lone Wolf
            </p>
          </div>
        </motion.div>

        {/* State 2: The Many (Wolf Packs) */}
        <motion.div
          style={{ opacity: manyOpacity }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="h-[80%] w-[80%]">
            <AlphaConstellation />
          </div>
          <p className="pointer-events-none absolute bottom-20 text-pack-frost text-xl">
            The Pack Forms
          </p>
        </motion.div>

        {/* State 3: The Infinite (Galaxy) */}
        <motion.div
          style={{ opacity: infiniteOpacity }}
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <div className="absolute inset-0">
            <InfiniteParticles />
          </div>

          <div className="pointer-events-none z-10 mb-12 text-center">
            <h2 className="mb-4 font-bold text-5xl text-pack-white">
              Unlimited Potential
            </h2>
            <p className="text-pack-frost/70 text-xl">
              Join the Pack. We achieve great feats, together.
            </p>
          </div>

          <div className="z-20 grid w-full max-w-4xl grid-cols-1 gap-8 px-4 md:grid-cols-2">
            {/* Technical Cavalry Card */}
            <div className="transform rounded-xl border border-pack-amber/20 bg-pack-surface/50 p-6 backdrop-blur-sm transition-transform duration-300 hover:scale-105">
              <h3 className="mb-2 font-bold text-pack-white text-xl">
                Technical Cavalry
              </h3>
              <p className="text-pack-frost/70 text-sm">
                Access to core engineering teams for critical support.
              </p>
            </div>
            {/* Power Access Card */}
            <div className="transform rounded-xl border border-pack-amber/20 bg-pack-surface/50 p-6 backdrop-blur-sm transition-transform duration-300 hover:scale-105">
              <h3 className="mb-2 font-bold text-pack-white text-xl">
                Power Access
              </h3>
              <p className="text-pack-frost/70 text-sm">
                Free enterprise-tier access to Tudo, TuPlan, and TuMeet.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
