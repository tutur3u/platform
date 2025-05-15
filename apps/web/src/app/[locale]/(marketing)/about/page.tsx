'use client';

import { AchievementsSection } from './components/achievements-section';
import { FutureVisionSection } from './components/future-vision-section';
import { HeroSection } from './components/hero-section';
import { ImpactStatsSection } from './components/impact-stats-section';
import { JoinUsSection } from './components/join-us-section';
import { JourneySection } from './components/journey-section';
import { PurposeSection } from './components/purpose-section';
import { VisionStatement } from './components/vision-statement';
import { motion } from 'framer-motion';

export default function AboutPage() {
  return (
    <main className="relative mx-auto overflow-x-clip pb-12">
      {/* Enhanced Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="bg-linear-to-br sm:h-160 sm:w-160 absolute -left-32 top-0 h-80 w-[20rem] rounded-full from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="h-70 w-70 bg-linear-to-br sm:h-140 sm:w-140 absolute -right-32 top-[30%] rounded-full from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="h-90 w-90 bg-linear-to-br sm:h-180 sm:w-180 absolute -bottom-32 left-1/2 -translate-x-1/2 rounded-full from-green-500/20 via-emerald-500/15 to-transparent blur-3xl sm:-bottom-64"
        />
      </div>

      {/* Enhanced Background Patterns */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="bg-size-[24px_24px] absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)]" />
        <div className="bg-size-[120px] absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] opacity-20" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.1, 0.15, 0.1] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
        />
      </div>

      <div className="container space-y-32 py-24">
        <HeroSection />
        <JourneySection />
        <PurposeSection />
        <VisionStatement />
        <AchievementsSection />
        <FutureVisionSection />
        <ImpactStatsSection />
        <JoinUsSection />
      </div>

      {/* Enhanced Animation Styles */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-10px) rotate(2deg);
          }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 4s ease-in-out infinite;
        }
        @keyframes gradient-shift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animate-gradient {
          animation: gradient-shift 8s ease infinite;
          background-size: 200% 200%;
        }
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .animate-shimmer {
          animation: shimmer 3s linear infinite;
          background: linear-gradient(
            90deg,
            rgba(var(--primary-rgb), 0.1) 25%,
            rgba(var(--primary-rgb), 0.2) 50%,
            rgba(var(--primary-rgb), 0.1) 75%
          );
          background-size: 200% 100%;
        }
      `}</style>
    </main>
  );
}
