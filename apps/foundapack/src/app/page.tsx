'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { Footer } from '../components/footer';
import { NightSky } from '../components/night-sky';
import { PackBackground } from '../components/pack-background';
import { ScalingNetwork } from '../components/scaling-network';
import { SceneITundra } from '../components/scene-i-tundra';
import { SceneIIICampfire } from '../components/scene-iii-campfire';
import { SceneVJoin } from '../components/scene-v-join';

export default function FoundapackPage() {
  const { scrollYProgress } = useScroll();

  // Opacity of embers (warmth) increases as we scroll
  const emberOpacity = useTransform(
    scrollYProgress,
    [0, 0.4, 0.6, 1],
    [0.1, 0.8, 0.8, 0.4]
  );

  return (
    <main className="relative min-h-screen bg-pack-void text-pack-frost">
      {/* Atmosphere */}
      <NightSky />

      <motion.div
        style={{ opacity: emberOpacity }}
        className="pointer-events-none fixed inset-0 z-0"
      >
        <PackBackground />
      </motion.div>

      {/* Content */}
      <SceneITundra />

      <ScalingNetwork />

      <SceneIIICampfire />

      <SceneVJoin />

      <Footer />
    </main>
  );
}
