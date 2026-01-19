'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { AtmosphericPass } from '../components/atmospheric-pass';
import { Footer } from '../components/footer';
import { NightSky } from '../components/night-sky';
import { PackBackground } from '../components/pack-background';
import { ScalingNetwork } from '../components/scaling-network';
import { SceneITundra } from '../components/scene-i-tundra';
import { SceneIIICampfire } from '../components/scene-iii-campfire';
import { SceneIVHunt } from '../components/scene-iv-hunt';
import { SceneVJoin } from '../components/scene-v-join';
import { TheCouncil } from '../components/the-council';

export default function FoundapackPage() {
  const { scrollYProgress } = useScroll();

  // Opacity of embers (warmth) increases as we scroll
  const emberOpacity = useTransform(
    scrollYProgress,
    [0, 0.25, 0.65, 1],
    [0.15, 0.85, 0.85, 0.5]
  );

  return (
    <main className="relative min-h-screen bg-pack-void text-pack-frost">
      <div className="pack-noise pointer-events-none fixed inset-0 z-40 opacity-20 mix-blend-overlay" />

      {/* Atmosphere */}
      <NightSky />

      <motion.div
        style={{ opacity: emberOpacity }}
        className="pointer-events-none fixed inset-0 z-0"
      >
        <PackBackground />
      </motion.div>

      <AtmosphericPass />

      {/* Content Sections with organic transitions */}
      <div className="relative z-10">
        <SceneITundra />

        <div className="relative z-50">
          <ScalingNetwork />
        </div>

        <div className="relative z-10">
          <SceneIIICampfire />
        </div>

        <div className="relative z-10">
          <TheCouncil />
        </div>

        <div className="relative z-10">
          <SceneIVHunt />
        </div>

        <div className="relative z-10">
          <SceneVJoin />
        </div>
      </div>

      <Footer />
    </main>
  );
}
