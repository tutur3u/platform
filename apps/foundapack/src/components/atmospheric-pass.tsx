'use client';

import { motion, useScroll, useTransform } from 'framer-motion';

export function AtmosphericPass() {
  const { scrollYProgress } = useScroll();

  // Fog density increases at key transition points
  // Lone Wolf -> Pack (approx 0.25 - 0.35)
  // Pack -> Infinite (approx 0.6 - 0.75)
  const fogOpacity = useTransform(
    scrollYProgress,
    [0, 0.2, 0.3, 0.4, 0.55, 0.65, 0.75, 0.9, 1],
    [0.1, 0.15, 0.4, 0.15, 0.15, 0.4, 0.15, 0.1, 0.1]
  );

  const fogScale = useTransform(
    scrollYProgress,
    [0, 0.3, 0.65, 1],
    [1, 1.2, 1.1, 1]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-15 overflow-hidden">
      {/* Rolling Mist Layer 1 */}
      <motion.div
        style={{ opacity: fogOpacity, scale: fogScale }}
        className="absolute inset-0"
      >
        <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_20%_80%,_rgba(11,11,16,0.4)_0%,_transparent_60%)]" />
        <div className="absolute top-0 right-0 h-full w-full bg-[radial-gradient(circle_at_80%_20%,_rgba(11,11,16,0.4)_0%,_transparent_60%)]" />
      </motion.div>

      {/* Ground Fog (Bottom of viewport) */}
      <motion.div
        style={{ opacity: useTransform(fogOpacity, (v) => v * 1.5) }}
        className="absolute right-0 bottom-0 left-0 h-[40vh] bg-gradient-to-t from-pack-void via-pack-void/40 to-transparent"
      />

      {/* Atmospheric Texture */}
      <div className="pack-texture-overlay opacity-[0.03]" />
    </div>
  );
}
