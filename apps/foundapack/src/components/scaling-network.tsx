'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { AlphaConstellation } from './alpha-constellation';
import { InfiniteParticles } from './infinite-particles';
import { WolfSilhouette } from './wolf-silhouette';

export function ScalingNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Background Opacity Transitions (Exclusive phases with crossfade zones)
  // 0.0 - 0.2: Lone Wolf (fully visible)
  // 0.2 - 0.3: Crossfade Wolf → Pack
  // 0.3 - 0.6: The Pack (fully visible)
  // 0.6 - 0.7: Crossfade Pack → Infinite
  // 0.7 - 1.0: Infinite (fully visible)

  const wolfOpacity = useTransform(scrollYProgress, [0, 0.2, 0.3], [1, 1, 0]);
  const packOpacity = useTransform(
    scrollYProgress,
    [0.2, 0.3, 0.6, 0.7],
    [0, 1, 1, 0]
  );
  const infiniteOpacity = useTransform(
    scrollYProgress,
    [0.6, 0.7, 1],
    [0, 1, 1]
  );

  // Content Visibility (One after another)
  const wolfContentOpacity = useTransform(
    scrollYProgress,
    [0, 0.15, 0.25],
    [1, 1, 0]
  );
  const wolfContentY = useTransform(scrollYProgress, [0, 0.25], [0, -80]);

  const packContentOpacity = useTransform(
    scrollYProgress,
    [0.2, 0.3, 0.6, 0.7],
    [0, 1, 1, 0]
  );
  const packContentY = useTransform(
    scrollYProgress,
    [0.2, 0.3, 0.7],
    [80, 0, -80]
  );

  const infiniteContentOpacity = useTransform(
    scrollYProgress,
    [0.6, 0.75, 1],
    [0, 1, 1]
  );
  const infiniteContentY = useTransform(scrollYProgress, [0.6, 0.75], [80, 0]);

  return (
    <section
      ref={containerRef}
      className="relative z-20 h-[600vh] bg-pack-void"
    >
      {/* STICKY CONTAINER */}
      <div className="sticky top-0 flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-pack-void/10">
        {/* ATMOSPHERIC PROGRESS INDICATOR - More visible */}
        <div className="absolute top-12 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3">
          <div className="relative h-0.5 w-64 overflow-hidden bg-pack-border">
            <motion.div
              style={{ scaleX: scrollYProgress }}
              className="absolute inset-0 origin-left bg-pack-amber shadow-[0_0_10px_var(--color-pack-amber)]"
            />
          </div>
          <motion.span
            className="font-mono text-[10px] text-pack-amber uppercase tracking-[0.6em]"
            style={{
              opacity: useTransform(
                scrollYProgress,
                [0, 0.1, 0.9, 1],
                [0.4, 1, 1, 0.4]
              ),
            }}
          >
            Evolution Mapping
          </motion.span>
        </div>

        {/* VISUAL LAYERS (FIXED BACKGROUNDS) */}
        <div className="pointer-events-none absolute inset-0">
          {/* Phase 1: Lone Wolf */}
          <motion.div
            style={{ opacity: wolfOpacity }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <WolfSilhouette />
          </motion.div>

          {/* Phase 2: The Pack */}
          <motion.div
            style={{ opacity: packOpacity }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="h-[80%] w-[80%] max-w-5xl">
              <AlphaConstellation />
            </div>
          </motion.div>

          {/* Phase 3: The Infinite */}
          <motion.div
            style={{ opacity: infiniteOpacity }}
            className="absolute inset-0"
          >
            <InfiniteParticles />
          </motion.div>
        </div>

        {/* CONTENT LAYERS (CENTERED TEXT) */}
        <div className="pointer-events-none relative z-10 h-full w-full">
          {/* Section 1: Lone Wolf Content */}
          <motion.div
            style={{ opacity: wolfContentOpacity, y: wolfContentY }}
            className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          >
            <div className="max-w-2xl rounded-3xl bg-pack-void/20 p-8 backdrop-blur-sm">
              <h2 className="pack-font-serif mb-6 font-bold text-5xl text-pack-white tracking-tight md:text-8xl">
                The Lone <span className="text-pack-frost/20">Wolf</span>
              </h2>
              <p className="text-pack-frost/60 text-xl leading-relaxed md:text-2xl">
                A single spark in the darkness. <br />
                Visionary, but vulnerable to the elements.
              </p>
            </div>
          </motion.div>

          {/* Section 2: The Pack Content */}
          <motion.div
            style={{ opacity: packContentOpacity, y: packContentY }}
            className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          >
            <div className="max-w-3xl rounded-3xl bg-pack-void/20 p-8 backdrop-blur-sm">
              <h2 className="pack-font-serif mb-6 font-bold text-5xl text-pack-white tracking-tight md:text-8xl">
                The Pack <span className="text-pack-amber">Forms</span>
              </h2>
              <p className="text-pack-frost/60 text-xl leading-relaxed md:text-2xl">
                When survivors unite, the dynamic shifts. <br />
                Isolation gives way to shared power.
              </p>
            </div>
          </motion.div>

          {/* Section 3: Infinite Content */}
          <motion.div
            style={{ opacity: infiniteContentOpacity, y: infiniteContentY }}
            className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          >
            <div className="mb-16">
              <h2 className="pack-font-serif mb-4 font-bold text-5xl text-pack-white tracking-tight md:text-8xl">
                Unlimited <span className="text-pack-orange">Potential</span>
              </h2>
              <p className="mx-auto max-w-2xl text-pack-frost/70 text-xl md:text-2xl">
                Join the Pack. We achieve great feats, together.
              </p>
            </div>

            <div className="grid w-full max-w-5xl grid-cols-1 gap-8 px-4 md:grid-cols-2">
              <div className="group relative transform overflow-hidden rounded-3xl border border-pack-amber/10 bg-pack-charcoal/40 p-8 text-left backdrop-blur-md transition-all duration-500 hover:border-pack-amber/40 hover:bg-pack-charcoal/60">
                <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity group-hover:opacity-30">
                  <div className="h-20 w-20 rounded-full border-2 border-pack-amber" />
                </div>
                <h3 className="pack-font-serif mb-4 font-bold text-2xl text-pack-white">
                  Technical Cavalry
                </h3>
                <p className="text-lg text-pack-frost/60 leading-relaxed">
                  Direct access to core engineering teams for deep-tech support
                  and architectural guidance.
                </p>
              </div>

              <div className="group relative transform overflow-hidden rounded-3xl border border-pack-orange/10 bg-pack-charcoal/40 p-8 text-left backdrop-blur-md transition-all duration-500 hover:border-pack-orange/40 hover:bg-pack-charcoal/60">
                <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity group-hover:opacity-30">
                  <div className="h-20 w-20 rounded-full border-2 border-pack-orange" />
                </div>
                <h3 className="pack-font-serif mb-4 font-bold text-2xl text-pack-white">
                  Power Access
                </h3>
                <p className="text-lg text-pack-frost/60 leading-relaxed">
                  Free enterprise-tier access to the entire Tuturuuu OS
                  ecosystem: Tudo, TuPlan, and TuMeet.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
