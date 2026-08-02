'use client';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import type { ConnectionStatus } from '@/hooks/use-live-api';

export const AURORA_COLORS = {
  purple: '#a855f7',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  rose: '#f43f5e',
  amber: '#f59e0b',
};

// Floating particle component for ambient effect
function FloatingParticle({
  index,
  connected,
}: {
  index: number;
  connected: boolean;
}) {
  const totalParticles = 16;
  const angle = (index / totalParticles) * Math.PI * 2;
  const baseRadius = 165 + (index % 3) * 20;
  const size = 3 + (index % 3) * 2;

  const colors = [
    AURORA_COLORS.purple,
    AURORA_COLORS.blue,
    AURORA_COLORS.pink,
    AURORA_COLORS.cyan,
    AURORA_COLORS.violet,
    AURORA_COLORS.rose,
  ];
  const color = colors[index % colors.length];

  // Fixed orbital path - independent of volume
  const innerRadius = baseRadius;
  const outerRadius = baseRadius + 25;

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: '50%',
        top: '50%',
        marginLeft: -size / 2,
        marginTop: -size / 2,
        background: color,
        boxShadow: `0 0 10px ${color}, 0 0 20px ${color}40`,
      }}
      initial={{
        x: Math.cos(angle) * baseRadius,
        y: Math.sin(angle) * baseRadius,
        opacity: 0,
      }}
      animate={{
        x: [
          Math.cos(angle) * innerRadius,
          Math.cos(angle + Math.PI * 0.5) * outerRadius,
          Math.cos(angle + Math.PI) * innerRadius,
          Math.cos(angle + Math.PI * 1.5) * outerRadius,
          Math.cos(angle + Math.PI * 2) * innerRadius,
        ],
        y: [
          Math.sin(angle) * innerRadius,
          Math.sin(angle + Math.PI * 0.5) * outerRadius,
          Math.sin(angle + Math.PI) * innerRadius,
          Math.sin(angle + Math.PI * 1.5) * outerRadius,
          Math.sin(angle + Math.PI * 2) * innerRadius,
        ],
        opacity: connected ? [0.5, 0.7, 0.5, 0.65, 0.5] : 0.2,
        scale: [1, 1.15, 1, 1.1, 1],
      }}
      transition={{
        duration: 10 + index * 0.8,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

// Beautiful multi-layered aurora blob
export function AuroraBlob({
  connected,
  isUserSpeaking,
  isSpeaking,
  volume,
}: {
  connected: boolean;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
  volume: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  // Scale response driven by actual audio volume
  const amplitude = useMotionValue(0);
  const amplitudeSpring = useSpring(amplitude, {
    stiffness: 150,
    damping: 18,
    mass: 0.6,
  });

  const blobScale = useTransform(amplitudeSpring, (v) => 0.98 + v * 0.1);

  // Brightness boost for speaking
  const brightness = useMotionValue(0);
  const brightnessSpring = useSpring(brightness, {
    stiffness: 120,
    damping: 20,
  });
  const coreOpacity = useTransform(brightnessSpring, (v) => 0.5 + v * 0.4);
  const coreScale = useTransform(brightnessSpring, (v) => 1 + v * 0.12);
  const glowOpacity = useTransform(brightnessSpring, (v) => 0.4 + v * 0.45);

  // Rotation for organic movement
  const rotation = useMotionValue(0);
  const rotationSpring = useSpring(rotation, { stiffness: 15, damping: 25 });

  // Update amplitude based on volume when AI is speaking
  useEffect(() => {
    if (isSpeaking && volume > 0) {
      // Use actual volume for dynamic scaling (volume is typically 0-1)
      const volumeBoost = Math.min(volume * 1.5, 1);
      amplitude.set(0.3 + volumeBoost * 0.7);
      brightness.set(0.3 + volumeBoost * 0.7);
    } else if (isUserSpeaking) {
      amplitude.set(0.6);
      brightness.set(0.7);
    } else if (connected) {
      amplitude.set(0.15);
      brightness.set(0);
    } else {
      amplitude.set(0.05);
      brightness.set(0);
    }

    // Subtle rotation based on activity
    rotation.set((isUserSpeaking ? 5 : 0) + (isSpeaking ? -5 : 0));
  }, [
    connected,
    amplitude,
    brightness,
    isUserSpeaking,
    isSpeaking,
    volume,
    rotation,
  ]);

  // Generate particles
  const particles = useMemo(() => Array.from({ length: 16 }, (_, i) => i), []);

  const baseOpacity = connected ? 0.85 : 0.4;

  return (
    <motion.div
      className="pointer-events-none relative flex items-center justify-center"
      style={{
        width: '50vmin',
        maxWidth: '420px',
        aspectRatio: '1',
        scale: blobScale,
        rotate: rotationSpring,
      }}
    >
      {/* Outer glow halo - reactive to speaking */}
      <motion.div
        className="absolute inset-[-30%]"
        style={{
          background: `radial-gradient(circle,
            ${AURORA_COLORS.purple}18 0%,
            ${AURORA_COLORS.blue}12 30%,
            ${AURORA_COLORS.pink}08 50%,
            transparent 70%)`,
          filter: 'blur(40px)',
          opacity: connected ? glowOpacity : 0.25,
          borderRadius: '70% 30% 55% 45% / 35% 65% 30% 70%',
        }}
        animate={{
          scale: [1, 1.03, 0.99, 1.01, 1],
          borderRadius: [
            '70% 30% 55% 45% / 35% 65% 30% 70%',
            '35% 65% 30% 70% / 70% 30% 55% 45%',
            '55% 45% 70% 30% / 45% 55% 65% 35%',
            '30% 70% 45% 55% / 55% 45% 35% 65%',
            '70% 30% 55% 45% / 35% 65% 30% 70%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 20,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 1: Large purple base - slowest */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 25% 25%,
            ${AURORA_COLORS.purple} 0%,
            ${AURORA_COLORS.violet}90 30%,
            transparent 70%)`,
          filter: 'blur(30px)',
          opacity: baseOpacity,
          borderRadius: '70% 30% 60% 40% / 40% 60% 30% 70%',
        }}
        animate={{
          scale: connected
            ? [1, 1.03, 0.99, 1.02, 1]
            : [0.92, 0.94, 0.93, 0.92],
          x: [0, 12, -4, -10, 0],
          y: [0, -10, 6, -4, 0],
          borderRadius: [
            '70% 30% 60% 40% / 40% 60% 30% 70%',
            '40% 60% 30% 70% / 70% 30% 60% 40%',
            '30% 70% 50% 50% / 50% 50% 70% 30%',
            '60% 40% 70% 30% / 30% 70% 40% 60%',
            '70% 30% 60% 40% / 40% 60% 30% 70%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 25,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 2: Vibrant blue */}
      <motion.div
        className="absolute inset-[5%]"
        style={{
          background: `radial-gradient(circle at 75% 35%,
            ${AURORA_COLORS.blue} 0%,
            ${AURORA_COLORS.cyan}80 40%,
            transparent 70%)`,
          filter: 'blur(25px)',
          opacity: baseOpacity,
          borderRadius: '35% 65% 70% 30% / 60% 35% 65% 40%',
        }}
        animate={{
          scale: connected
            ? [0.99, 1.04, 0.97, 1.01, 0.99]
            : [0.88, 0.9, 0.89, 0.88],
          x: [-6, 10, -8, -12, -6],
          y: [6, -8, 10, -5, 6],
          rotate: [0, 90, 180, 270, 360],
          borderRadius: [
            '35% 65% 70% 30% / 60% 35% 65% 40%',
            '65% 35% 30% 70% / 35% 65% 40% 60%',
            '50% 50% 65% 35% / 70% 30% 35% 65%',
            '30% 70% 40% 60% / 45% 55% 70% 30%',
            '35% 65% 70% 30% / 60% 35% 65% 40%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 22,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 3: Hot pink accent */}
      <motion.div
        className="absolute inset-[10%]"
        style={{
          background: `radial-gradient(circle at 35% 65%,
            ${AURORA_COLORS.pink} 0%,
            ${AURORA_COLORS.rose}70 35%,
            transparent 65%)`,
          filter: 'blur(20px)',
          opacity: baseOpacity * 0.9,
          borderRadius: '65% 35% 30% 70% / 70% 40% 60% 30%',
        }}
        animate={{
          scale: connected
            ? [1.01, 0.97, 1.03, 0.99, 1.01]
            : [0.82, 0.84, 0.83, 0.82],
          x: [0, -14, 4, 10, 0],
          y: [0, 12, -6, -10, 0],
          rotate: [0, -90, -180, -270, -360],
          borderRadius: [
            '65% 35% 30% 70% / 70% 40% 60% 30%',
            '30% 70% 65% 35% / 40% 60% 30% 70%',
            '45% 55% 70% 30% / 30% 70% 55% 45%',
            '70% 30% 35% 65% / 55% 45% 65% 35%',
            '65% 35% 30% 70% / 70% 40% 60% 30%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 20,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 4: Cyan sparkle */}
      <motion.div
        className="absolute inset-[20%]"
        style={{
          background: `radial-gradient(circle at 65% 30%,
            ${AURORA_COLORS.cyan} 0%,
            ${AURORA_COLORS.blue}60 30%,
            transparent 55%)`,
          filter: 'blur(15px)',
          opacity: baseOpacity * 0.85,
          borderRadius: '40% 60% 65% 35% / 55% 45% 35% 65%',
        }}
        animate={{
          scale: connected
            ? [0.98, 1.04, 0.96, 1.01, 0.98]
            : [0.72, 0.74, 0.73, 0.72],
          x: [6, -10, 8, 12, 6],
          y: [-6, 10, -8, -10, -6],
          borderRadius: [
            '40% 60% 65% 35% / 55% 45% 35% 65%',
            '60% 40% 35% 65% / 35% 65% 60% 40%',
            '70% 30% 45% 55% / 45% 55% 30% 70%',
            '35% 65% 55% 45% / 65% 35% 45% 55%',
            '40% 60% 65% 35% / 55% 45% 35% 65%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 18,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 5: Amber warmth accent */}
      <motion.div
        className="absolute inset-[25%]"
        style={{
          background: `radial-gradient(circle at 50% 70%,
            ${AURORA_COLORS.amber}90 0%,
            ${AURORA_COLORS.rose}50 30%,
            transparent 50%)`,
          filter: 'blur(12px)',
          opacity: baseOpacity * 0.6,
          borderRadius: '55% 45% 35% 65% / 65% 35% 55% 45%',
        }}
        animate={{
          scale: connected
            ? [1, 1.04, 0.98, 1.02, 1]
            : [0.66, 0.68, 0.67, 0.66],
          x: [-5, 8, -6, -8, -5],
          y: [5, -8, 6, 8, 5],
          borderRadius: [
            '55% 45% 35% 65% / 65% 35% 55% 45%',
            '35% 65% 55% 45% / 45% 55% 35% 65%',
            '60% 40% 45% 55% / 35% 65% 60% 40%',
            '45% 55% 65% 35% / 55% 45% 40% 60%',
            '55% 45% 35% 65% / 65% 35% 55% 45%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 16,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Core gradient center */}
      <motion.div
        className="absolute inset-[28%]"
        style={{
          background: `radial-gradient(circle,
            ${AURORA_COLORS.violet}95 0%,
            ${AURORA_COLORS.purple}85 25%,
            ${AURORA_COLORS.blue}60 50%,
            ${AURORA_COLORS.pink}35 75%,
            transparent 100%)`,
          filter: 'blur(10px)',
          opacity: baseOpacity * 0.9,
          borderRadius: '60% 40% 45% 55% / 55% 60% 40% 45%',
        }}
        animate={{
          scale: connected ? [1, 1.03, 0.98, 1.01, 1] : [0.58, 0.6, 0.59, 0.58],
          borderRadius: [
            '60% 40% 45% 55% / 55% 60% 40% 45%',
            '40% 60% 55% 45% / 45% 40% 60% 55%',
            '55% 45% 65% 35% / 35% 55% 45% 65%',
            '45% 55% 35% 65% / 65% 45% 55% 35%',
            '60% 40% 45% 55% / 55% 60% 40% 45%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 14,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Bright inner core - reactive to speaking */}
      <motion.div
        className="absolute inset-[35%]"
        style={{
          background: `radial-gradient(circle,
            rgba(255,255,255,0.75) 0%,
            ${AURORA_COLORS.violet}65 35%,
            ${AURORA_COLORS.purple}35 65%,
            transparent 100%)`,
          filter: 'blur(10px)',
          opacity: connected ? coreOpacity : 0.25,
          scale: coreScale,
          borderRadius: '55% 45% 60% 40% / 40% 55% 45% 60%',
        }}
        animate={{
          borderRadius: [
            '55% 45% 60% 40% / 40% 55% 45% 60%',
            '40% 60% 45% 55% / 55% 40% 60% 45%',
            '60% 40% 50% 50% / 45% 60% 40% 55%',
            '45% 55% 55% 45% / 60% 45% 55% 40%',
            '55% 45% 60% 40% / 40% 55% 45% 60%',
          ],
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 18,
          repeat: shouldReduceMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating particles */}
      {!shouldReduceMotion &&
        particles.map((i) => (
          <FloatingParticle key={i} index={i} connected={connected} />
        ))}

      {/* Shine highlight */}
      <motion.div
        className="absolute inset-[22%]"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.03) 100%)',
          opacity: connected ? 0.25 : 0.1,
          borderRadius: '65% 35% 45% 55% / 50% 60% 35% 65%',
        }}
        animate={{
          rotate: [0, 360],
          borderRadius: [
            '65% 35% 45% 55% / 50% 60% 35% 65%',
            '35% 65% 55% 45% / 65% 35% 60% 40%',
            '50% 50% 65% 35% / 40% 55% 45% 60%',
            '45% 55% 35% 65% / 55% 45% 60% 40%',
            '65% 35% 45% 55% / 50% 60% 35% 65%',
          ],
        }}
        transition={{
          rotate: {
            duration: shouldReduceMotion ? 0 : 60,
            repeat: shouldReduceMotion ? 0 : Infinity,
            ease: 'linear',
          },
          borderRadius: {
            duration: shouldReduceMotion ? 0 : 35,
            repeat: shouldReduceMotion ? 0 : Infinity,
            ease: 'easeInOut',
          },
        }}
      />
    </motion.div>
  );
}

// Status pill component
export function StatusPill({
  connected,
  connectionStatus,
  isUserSpeaking,
  isSpeaking,
}: {
  connected: boolean;
  connectionStatus: ConnectionStatus;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  const status =
    connectionStatus === 'reconnecting'
      ? t('reconnecting')
      : connectionStatus === 'connecting'
        ? t('connecting')
        : !connected
          ? t('ready_to_connect')
          : isUserSpeaking
            ? t('listening')
            : isSpeaking
              ? t('speaking')
              : t('ready');

  const isConnecting =
    connectionStatus === 'connecting' || connectionStatus === 'reconnecting';

  const getStatusStyle = () => {
    // Connecting/reconnecting states
    if (isConnecting) {
      return {
        bg: `${AURORA_COLORS.amber}20`,
        text: AURORA_COLORS.amber,
        glow: AURORA_COLORS.amber,
      };
    }
    if (!connected) {
      return {
        bg: `${AURORA_COLORS.violet}20`,
        text: AURORA_COLORS.violet,
        glow: AURORA_COLORS.violet,
      };
    }
    if (isUserSpeaking) {
      return {
        bg: '#22c55e20',
        text: '#22c55e',
        glow: '#22c55e',
      };
    }
    if (isSpeaking) {
      return {
        bg: `${AURORA_COLORS.cyan}25`,
        text: AURORA_COLORS.cyan,
        glow: AURORA_COLORS.cyan,
      };
    }
    return {
      bg: 'rgba(255,255,255,0.1)',
      text: 'rgba(255,255,255,0.7)',
      glow: 'rgba(255,255,255,0.3)',
    };
  };

  const style = getStatusStyle();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={
        isConnecting ? { opacity: [1, 0.6, 1], y: 0 } : { opacity: 1, y: 0 }
      }
      transition={
        isConnecting
          ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
      className="rounded-full px-5 py-2 font-medium text-sm backdrop-blur-sm"
      style={{
        background: style.bg,
        color: style.text,
        boxShadow:
          connected || isConnecting ? `0 0 20px ${style.glow}30` : 'none',
      }}
    >
      <span className="flex items-center gap-2.5">
        <motion.span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: style.text,
            boxShadow: `0 0 8px ${style.glow}`,
          }}
          animate={{
            scale: connected || isConnecting ? [1, 1.4, 1] : 1,
            opacity: connected || isConnecting ? [0.6, 1, 0.6] : 0.5,
          }}
          transition={{
            duration: isConnecting ? 0.8 : 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        {status}
      </span>
    </motion.div>
  );
}
